/**
 * Scheduled-freeze cron handler ([BONUS] FR-10, ARCHITECTURE.md §5f).
 *
 * A cron-triggered sweep that proactively settles missed-day freezes for players
 * who have NOT returned, keeping the stored `freezeUsed`/`streakBroken` flags
 * fresh for the dashboard/calendar of absent players. It is a freshness
 * optimizer, NOT a second source of truth — lazy evaluation on next check-in
 * remains canonical (ADR-2).
 *
 * ADR-2 — NO parallel freeze logic. Per player/axis the sweep runs the SAME
 * sequence the live check-in / hand-completed path runs (ARCHITECTURE §5c):
 *   (1) `evaluateFreeze` — the pure `freeze.service` decision (monthly grant +
 *       missed-day detection), identical to the live path;
 *   (2) `grantMonthlyFreeze` / `consumeFreeze` — the SAME atomic repository
 *       writes the handlers call. There is no second `consumeFreeze`.
 *
 * Idempotency (the load-bearing invariant, §5f step 4). The atomic
 * `consumeFreeze` is gated by the per-day `attribute_not_exists(date)` condition
 * on `streaks-freeze-history`: whichever of {cron pass, lazy check-in, second
 * cron pass} runs FIRST writes the freeze-history row and decrements; every
 * later run against the SAME missed day fails the condition and no-ops. So the
 * sweep is safe to run repeatedly and can never double-consume — running it
 * twice, or cron-then-lazy, settles a missed day exactly once.
 *
 * NOT an HTTP route (no public surface, §5f / §6). Wired as the `scheduledFreeze`
 * function with a `schedule` event, disabled by default
 * (`FREEZE_CRON_ENABLED=false`, FR-10).
 */
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

import { docClient } from '../../shared/config/dynamo';
import {
  consumeFreeze,
  grantMonthlyFreeze,
} from '../repositories/dynamo.repository';
import { evaluateFreeze } from '../services/freeze.service';
import { nowIso, utcDay, yearMonth } from '../lib/utc';
import { logger } from '../../shared/config/logger';
import type { PlayerStreak } from '../domain/types';

const PLAYERS_TABLE = process.env.STREAKS_PLAYERS_TABLE ?? 'streaks-players';

/** Bounded page size for the players `Scan` (§5f — keep each page cheap). */
const SCAN_PAGE_LIMIT = 100;

/** The sweep outcome (also returned from the Lambda entry for observability). */
export interface SweepResult {
  /** Players examined across all pages. */
  scanned: number;
  /** Freezes actually consumed this sweep (excludes already-settled no-ops). */
  consumed: number;
  /** Per-player errors that were logged and skipped (one never aborts the sweep). */
  errors: number;
}

/**
 * Settle freezes for ONE player by reusing the live lazy-eval sequence on BOTH
 * axes (ADR-2). Returns the number of freezes consumed for this player (0, 1, or
 * 2 — login and play can each protect their own missed day; the shared balance
 * caps how many actually commit). Every write is idempotent: a re-run against an
 * already-settled missed day is a no-op via the per-day history guard.
 */
export async function settleFreeze(player: PlayerStreak, today: string): Promise<number> {
  const now = nowIso();
  let consumed = 0;

  // Re-load the freeze balance as it mutates across the two axes so the second
  // axis sees the post-grant/post-consume state (mirrors a real second request).
  let current = player;

  for (const axis of ['login', 'play'] as const) {
    const lastDate = axis === 'login' ? current.lastLoginDate : current.lastPlayDate;
    const decision = evaluateFreeze(current, lastDate, today);

    // (1) Monthly grant — the SAME repository write the live path uses,
    // idempotent per YYYY-MM (so two sweeps in one month grant at most once).
    if (decision.grantedMonthly) {
      await grantMonthlyFreeze({
        playerId: current.playerId,
        newFreezesAvailable: current.freezesAvailable + 1,
        yearMonth: yearMonth(today),
        now,
      });
      current = {
        ...current,
        freezesAvailable: current.freezesAvailable + 1,
        lastFreezeGrantDate: yearMonth(today),
      };
    }

    // (2) Consume — the SAME atomic `consumeFreeze` (ADR-2, no second impl). The
    // per-day `attribute_not_exists(date)` guard makes cron+lazy collision-safe:
    // a `false` here means the missed day was already settled (lazy or a prior
    // sweep) — a clean no-op, never a double-consume.
    if (
      decision.freezeConsumed &&
      decision.missedDate !== undefined &&
      decision.freezeSource !== undefined
    ) {
      const committed = await consumeFreeze({
        playerId: current.playerId,
        missedDate: decision.missedDate,
        source: decision.freezeSource,
        newFreezesAvailable: decision.newFreezesAvailable,
        newFreezesUsedThisMonth: decision.newFreezesUsedThisMonth,
        now,
      });
      if (committed) {
        consumed += 1;
        current = {
          ...current,
          freezesAvailable: decision.newFreezesAvailable,
          freezesUsedThisMonth: decision.newFreezesUsedThisMonth,
        };
        logger.info('scheduled-freeze consumed freeze', {
          playerId: current.playerId,
          missedDate: decision.missedDate,
          source: decision.freezeSource,
          axis,
        });
      }
    }
  }

  return consumed;
}

/**
 * Run the full sweep: page the players table and settle each player's freezes.
 *
 * NFR-8 / Inv 8 EXCEPTION — THE ONE SANCTIONED `Scan`. There is no natural
 * "stale `lastLoginDate`" index, so the bonus cron pages a `Scan` of
 * `streaks-players` (the production upgrade is a `lastActivityDate` GSI, §5f
 * step 1). This is cron/admin tooling that runs OFF the hot path on a schedule —
 * it is NEVER a player/internal/calendar request path. This is the only `Scan`
 * in `src/`; a `grep Scan src` must show it ONLY here.
 *
 * Per-player errors are logged and skipped so one bad player never aborts the
 * sweep (§5f step 5).
 */
export async function runScheduledFreeze(): Promise<SweepResult> {
  const today = utcDay(nowIso());
  const result: SweepResult = { scanned: 0, consumed: 0, errors: 0 };
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    // The sanctioned paginated Scan (see the function docstring above).
    const page = await docClient.send(
      new ScanCommand({
        TableName: PLAYERS_TABLE,
        Limit: SCAN_PAGE_LIMIT,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    const players = (page.Items as PlayerStreak[] | undefined) ?? [];

    for (const player of players) {
      result.scanned += 1;
      try {
        result.consumed += await settleFreeze(player, today);
      } catch (err) {
        // One failing player must never abort the sweep (§5f step 5).
        result.errors += 1;
        logger.error('scheduled-freeze per-player sweep failed', {
          playerId: player.playerId,
          err,
        });
      }
    }

    exclusiveStartKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey !== undefined);

  return result;
}

/**
 * The Lambda entry (EventBridge `schedule` event, serverless.yml). Thin (Inv 6):
 * runs the sweep, emits a summary (the `streaks.scheduled.swept` metric hook,
 * §8), and returns the result. Side-effect-safe to run repeatedly (idempotent
 * via the per-day freeze-history guard).
 */
export async function scheduledFreeze(): Promise<SweepResult> {
  const result = await runScheduledFreeze();
  logger.info('scheduled-freeze sweep complete', {
    scanned: result.scanned,
    consumed: result.consumed,
    errors: result.errors,
  });
  return result;
}
