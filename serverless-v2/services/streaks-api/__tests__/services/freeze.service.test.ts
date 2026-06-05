/**
 * Pure-logic unit tests for the freeze service (CLAUDE.md §3 strict scope,
 * Inv 5, ARCHITECTURE §5c). `evaluateFreeze` is PURE: given the loaded player +
 * today's UTC date + the relevant `lastDate` (the axis's last active day), it
 * returns the lazy-eval DECISION — monthly grant, missed-day detection, freeze
 * consumption — WITHOUT doing any DynamoDB IO. The check-in / hand-completed
 * flow applies the decision (grant → consume → transition) before the streak
 * transition.
 *
 * Gap semantics (binding): gap = daysBetween(lastDate, today).
 *   gap===1 consecutive → normal advance; gap===2 exactly ONE missed day;
 *   gap>=3 TWO or more missed days (a single freeze can't cover both → reset).
 */
import { PutCommand, DeleteCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { evaluateFreeze } from '../../src/services/freeze.service';
import { settleFreeze } from '../../src/handlers/scheduled-freeze';
import { consumeFreeze } from '../../src/repositories/dynamo.repository';
import { docClient } from '../../shared/config/dynamo';
import { nowIso, utcDay, yesterday as priorDay } from '../../src/lib/utc';
import type { PlayerStreak } from '../../src/domain/types';

const TODAY = '2026-06-05';

/** A fully-populated existing player record; override per test. */
function player(overrides: Partial<PlayerStreak>): PlayerStreak {
  return {
    playerId: 'p1',
    loginStreak: 0,
    playStreak: 0,
    bestLoginStreak: 0,
    bestPlayStreak: 0,
    lastLoginDate: null,
    lastPlayDate: null,
    freezesAvailable: 0,
    freezesUsedThisMonth: 0,
    lastFreezeGrantDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('freeze.service — evaluateFreeze', () => {
  // S4-1 / S4-2: missed one day, freeze available ⇒ consume, streak preserved.
  it('missed one day, freeze available ⇒ freeze consumed + streak protected', () => {
    // lastLoginDate = 2 days ago (gap 2), freezesAvailable = 1, loginStreak = 9.
    const p = player({
      loginStreak: 9,
      bestLoginStreak: 9,
      lastLoginDate: '2026-06-03', // 2 days before today (gap 2)
      freezesAvailable: 1,
      freezesUsedThisMonth: 0,
      lastFreezeGrantDate: '2026-06', // same month → no monthly grant noise
    });

    const d = evaluateFreeze(p, '2026-06-03', TODAY);

    expect(d.protected).toBe(true);
    expect(d.freezeConsumed).toBe(true);
    expect(d.missedDate).toBe('2026-06-04'); // the single missed day (yesterday)
    expect(d.freezeSource).toBe('purchased'); // no free_monthly available this month
    expect(d.newFreezesAvailable).toBe(0); // 1 - 1
    expect(d.newFreezesUsedThisMonth).toBe(1); // 0 + 1
    expect(d.grantedMonthly).toBe(false);
  });

  // SM-5(b): a multi-day gap with only 1 freeze still resets — the single
  // freeze covers the FIRST missed day, the streak resets on the SECOND.
  // S4-3 / S4-4: two missed days (gap>=3), one freeze ⇒ NO protection, reset.
  it('SM-5(b) missed two days, one freeze ⇒ NOT protected (single freeze cannot cover both)', () => {
    // lastLoginDate = 3 days ago → gap 3 = two missed days.
    const p = player({
      loginStreak: 9,
      bestLoginStreak: 9,
      lastLoginDate: '2026-06-02', // gap 3 (two missed days)
      freezesAvailable: 1,
      lastFreezeGrantDate: '2026-06',
    });

    const d = evaluateFreeze(p, '2026-06-02', TODAY);

    expect(d.protected).toBe(false);
    expect(d.freezeConsumed).toBe(false);
    expect(d.missedDate).toBeUndefined();
    expect(d.newFreezesAvailable).toBe(1); // untouched
    expect(d.newFreezesUsedThisMonth).toBe(0);
  });

  // gap===2 but no freeze ⇒ no protection.
  it('missed one day, NO freeze ⇒ NOT protected (reset)', () => {
    const p = player({
      loginStreak: 9,
      lastLoginDate: '2026-06-03', // gap 2
      freezesAvailable: 0,
      lastFreezeGrantDate: '2026-06',
    });

    const d = evaluateFreeze(p, '2026-06-03', TODAY);

    expect(d.protected).toBe(false);
    expect(d.freezeConsumed).toBe(false);
    expect(d.newFreezesAvailable).toBe(0);
  });

  // gap===1 consecutive ⇒ no consume.
  it('consecutive day (gap 1) ⇒ no freeze consumed, no missed day', () => {
    const p = player({
      loginStreak: 4,
      lastLoginDate: '2026-06-04', // yesterday → gap 1
      freezesAvailable: 2,
      lastFreezeGrantDate: '2026-06',
    });

    const d = evaluateFreeze(p, '2026-06-04', TODAY);

    expect(d.protected).toBe(false);
    expect(d.freezeConsumed).toBe(false);
    expect(d.newFreezesAvailable).toBe(2);
  });

  // S4-5 / S4-6: a consumed freeze prefers the free_monthly granted this turn.
  it('freeze covers both axes: source is free_monthly when the monthly grant lands the same turn', () => {
    // Prior-month grant + gap 2 + zero starting balance: the monthly grant lands
    // (balance → 1) THEN the consume spends it, so the consumed source is
    // free_monthly. One decision protects BOTH axes for the same missed day.
    const p = player({
      loginStreak: 9,
      lastLoginDate: '2026-05-30', // a prior date; the CALLER passes the axis lastDate
      freezesAvailable: 0,
      freezesUsedThisMonth: 0,
      lastFreezeGrantDate: '2026-05', // prior month → grant due
    });

    // Use a controlled gap-2 lastDate so this is "exactly one missed day".
    const d = evaluateFreeze(p, '2026-06-03', TODAY);

    expect(d.grantedMonthly).toBe(true);
    expect(d.protected).toBe(true);
    expect(d.freezeConsumed).toBe(true);
    expect(d.freezeSource).toBe('free_monthly');
    expect(d.missedDate).toBe('2026-06-04');
    // grant (+1) then consume (−1) nets to 0 available.
    expect(d.newFreezesAvailable).toBe(0);
    expect(d.newFreezesUsedThisMonth).toBe(1);
    expect(d.newLastFreezeGrantDate).toBe('2026-06');
  });

  // S4-7 / S4-8: monthly grant on a different YYYY-MM; same month → no grant.
  it('monthly grant: prior YYYY-MM ⇒ +1 freeze and lastFreezeGrantDate set to current month', () => {
    const p = player({
      loginStreak: 4,
      lastLoginDate: '2026-06-04', // gap 1 (consecutive) → no consume, isolate the grant
      freezesAvailable: 2,
      lastFreezeGrantDate: '2026-05', // prior month
    });

    const d = evaluateFreeze(p, '2026-06-04', TODAY);

    expect(d.grantedMonthly).toBe(true);
    expect(d.newFreezesAvailable).toBe(3); // 2 + 1
    expect(d.newLastFreezeGrantDate).toBe('2026-06');
    expect(d.freezeConsumed).toBe(false);
  });

  it('monthly grant: never granted (null) ⇒ +1 freeze, lastFreezeGrantDate set', () => {
    const p = player({
      loginStreak: 1,
      lastLoginDate: '2026-06-04', // gap 1
      freezesAvailable: 0,
      lastFreezeGrantDate: null,
    });

    const d = evaluateFreeze(p, '2026-06-04', TODAY);

    expect(d.grantedMonthly).toBe(true);
    expect(d.newFreezesAvailable).toBe(1);
    expect(d.newLastFreezeGrantDate).toBe('2026-06');
  });

  it('monthly grant: same YYYY-MM ⇒ no grant', () => {
    const p = player({
      loginStreak: 4,
      lastLoginDate: '2026-06-04',
      freezesAvailable: 2,
      lastFreezeGrantDate: '2026-06', // already granted this month
    });

    const d = evaluateFreeze(p, '2026-06-04', TODAY);

    expect(d.grantedMonthly).toBe(false);
    expect(d.newFreezesAvailable).toBe(2);
    expect(d.newLastFreezeGrantDate).toBe('2026-06');
  });

  // New player / no prior date ⇒ no gap to protect, but the monthly grant can
  // still land on the first-ever activity.
  it('null lastDate (new player) ⇒ no consume; monthly grant still applies', () => {
    const p = player({
      lastLoginDate: null,
      freezesAvailable: 0,
      lastFreezeGrantDate: null,
    });

    const d = evaluateFreeze(p, null, TODAY);

    expect(d.protected).toBe(false);
    expect(d.freezeConsumed).toBe(false);
    expect(d.grantedMonthly).toBe(true);
    expect(d.newFreezesAvailable).toBe(1);
  });
});

/**
 * S8-4 / S8-5 — cron/lazy idempotency (FR-10, ARCHITECTURE §5f step 4, ADR-2).
 *
 * The scheduled-freeze cron reuses the SAME `freeze.service` decision +
 * `consumeFreeze` atomic the live check-in uses; the per-day
 * `attribute_not_exists(date)` guard on `streaks-freeze-history` makes running
 * the consume twice — two cron passes, or cron-then-lazy — settle a missed day
 * EXACTLY once. These run against DynamoDB Local (jest.setup env), with a unique
 * playerId + RELATIVE dates per run so reruns never collide. The shared client
 * is closed in the global afterAll (jest.teardown) — no per-file teardown needed.
 */
describe('freeze.service — cron/lazy idempotency (S8-4/S8-5, §5f step 4)', () => {
  const PLAYERS_TABLE = process.env.STREAKS_PLAYERS_TABLE ?? 'streaks-players';
  const ACTIVITY_TABLE = process.env.STREAKS_ACTIVITY_TABLE ?? 'streaks-activity';
  const FREEZE_HISTORY_TABLE =
    process.env.STREAKS_FREEZE_HISTORY_TABLE ?? 'streaks-freeze-history';

  const REAL_TODAY = utcDay(nowIso());
  const MISSED = priorDay(REAL_TODAY); // the single missed day (yesterday)
  const GAP_DATE = priorDay(MISSED); // 2 days ago → gap 2, protectable

  /** Seed a player with a 1-missed-day gap + exactly one freeze. */
  async function seedGapPlayer(playerId: string): Promise<void> {
    const p: PlayerStreak = {
      playerId,
      loginStreak: 9,
      playStreak: 0,
      bestLoginStreak: 9,
      bestPlayStreak: 0,
      lastLoginDate: GAP_DATE,
      lastPlayDate: null,
      freezesAvailable: 1,
      freezesUsedThisMonth: 0,
      lastFreezeGrantDate: REAL_TODAY.slice(0, 7), // this month → no grant noise
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await docClient.send(new PutCommand({ TableName: PLAYERS_TABLE, Item: p }));
    for (const date of [REAL_TODAY, MISSED, GAP_DATE]) {
      await docClient.send(
        new DeleteCommand({ TableName: ACTIVITY_TABLE, Key: { playerId, date } }),
      );
    }
    await docClient.send(
      new DeleteCommand({ TableName: FREEZE_HISTORY_TABLE, Key: { playerId, date: MISSED } }),
    );
  }

  async function getBalance(playerId: string): Promise<number> {
    const r = await docClient.send(
      new GetCommand({ TableName: PLAYERS_TABLE, Key: { playerId } }),
    );
    return (r.Item as PlayerStreak).freezesAvailable;
  }

  async function freezeHistoryCount(playerId: string): Promise<number> {
    const r = await docClient.send(
      new QueryCommand({
        TableName: FREEZE_HISTORY_TABLE,
        KeyConditionExpression: 'playerId = :p AND #d = :date',
        ExpressionAttributeNames: { '#d': 'date' },
        ExpressionAttributeValues: { ':p': playerId, ':date': MISSED },
      }),
    );
    return (r.Items ?? []).length;
  }

  it('two cron passes against the same missed day ⇒ consume exactly ONCE (no double-consume)', async () => {
    const playerId = `test-s8-cron-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await seedGapPlayer(playerId);

    // First sweep: settles the missed day, decrements the balance 1 → 0.
    const player1 = (
      await docClient.send(new GetCommand({ TableName: PLAYERS_TABLE, Key: { playerId } }))
    ).Item as PlayerStreak;
    const firstConsumed = await settleFreeze(player1, REAL_TODAY);

    // Second sweep over the now-updated player: the per-day guard makes it a
    // clean no-op — no second consume, balance unchanged, one history row only.
    const player2 = (
      await docClient.send(new GetCommand({ TableName: PLAYERS_TABLE, Key: { playerId } }))
    ).Item as PlayerStreak;
    const secondConsumed = await settleFreeze(player2, REAL_TODAY);

    expect(firstConsumed).toBe(1);
    expect(secondConsumed).toBe(0); // the load-bearing assertion
    expect(await getBalance(playerId)).toBe(0); // decremented once, not twice
    expect(await freezeHistoryCount(playerId)).toBe(1); // protected once

    await docClient.send(new DeleteCommand({ TableName: PLAYERS_TABLE, Key: { playerId } }));
    await docClient.send(
      new DeleteCommand({ TableName: FREEZE_HISTORY_TABLE, Key: { playerId, date: MISSED } }),
    );
  });

  it('cron then lazy (the SAME consumeFreeze) against the same day ⇒ the lazy pass no-ops', async () => {
    const playerId = `test-s8-cronlazy-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await seedGapPlayer(playerId);

    // Cron settles the missed day first.
    const player = (
      await docClient.send(new GetCommand({ TableName: PLAYERS_TABLE, Key: { playerId } }))
    ).Item as PlayerStreak;
    const cronConsumed = await settleFreeze(player, REAL_TODAY);
    expect(cronConsumed).toBe(1);

    // Now a lazy check-in tries the SAME atomic consume for the SAME missed day
    // (post-decrement, balance 0): the `freezesAvailable > 0` + per-day
    // `attribute_not_exists(date)` conditions cancel the transaction → false.
    const lazy = await consumeFreeze({
      playerId,
      missedDate: MISSED,
      source: 'purchased',
      newFreezesAvailable: 0,
      newFreezesUsedThisMonth: 2,
      now: nowIso(),
    });
    expect(lazy).toBe(false); // never double-consumes
    expect(await getBalance(playerId)).toBe(0);
    expect(await freezeHistoryCount(playerId)).toBe(1);

    await docClient.send(new DeleteCommand({ TableName: PLAYERS_TABLE, Key: { playerId } }));
    await docClient.send(
      new DeleteCommand({ TableName: FREEZE_HISTORY_TABLE, Key: { playerId, date: MISSED } }),
    );
  });
});
