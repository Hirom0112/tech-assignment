/**
 * POST /internal/streaks/hand-completed (FR-6.1, API_CONTRACT.md §4.6) —
 * server-to-server: the hand processor reports a completed hand; we advance the
 * player's PLAY streak for the hand's UTC day.
 *
 * THIN handler (Inv 6): validates the body, computes the hand's UTC day +
 * its yesterday ONCE at the edge from `completedAt` (Inv 1 — the HAND's day,
 * never now), loads the player, calls the pure play service, then persists via
 * the repository's conditional writes. No `docClient` here, no streak math here.
 *
 * Auth (Inv 10, FR-6.3): guarded by `internalAuthMiddleware` (X-Internal-Secret)
 * ONLY — never the player-auth surface. The target player is in the BODY, never
 * `X-Player-Id`. The route is mounted outside the player-auth router group.
 *
 * Idempotency: the activity merge's create-or-merge condition (pattern E) is the
 * source of truth (Inv 2). The first hand of the UTC day advances; later hands
 * are 200 no-ops (`playStreakUpdated:false`), never a double-increment.
 *
 * S2 wires `milestoneEarned: null` (play-milestone reward awarding is S3).
 */
import type { Request, Response } from 'express';

import {
  advancePlayStreak,
  awardMilestone,
  createPlayer,
  getPlayer,
  mergePlayed,
  resetPlayStreak,
} from '../repositories/dynamo.repository';
import { applyHandCompleted } from '../services/play.service';
import { detectMilestone } from '../services/reward.service';
import { isIsoInstant, nowIso, utcDay, yesterday as priorDay } from '../lib/utc';
import { logger } from '../../shared/config/logger';
import type { HandCompletedResponse, PlayerStreak, RewardRecord } from '../domain/types';

/** The validated hand-completed request body. */
interface HandCompletedBody {
  playerId: string;
  tableId: number;
  handId: string;
  completedAt: string;
}

export async function handCompletedHandler(req: Request, res: Response): Promise<void> {
  const body = validateBody(req.body);
  if (body === null) {
    res.status(400).json({
      error: 'BadRequest',
      message: 'playerId, tableId, handId and ISO-8601 completedAt are all required',
    });
    return;
  }

  const { playerId, completedAt } = body;

  // Day-math computed once at the edge from the HAND's completedAt (Inv 1) —
  // NOT now. The UTC day of completedAt is the day credited (spec §Edge 1).
  const now = nowIso();
  const day = utcDay(completedAt);
  const yesterday = priorDay(day);

  try {
    const existing = await getPlayer(playerId);

    // Same-day repeat → idempotent 200 no-op (no write).
    if (existing !== null && existing.lastPlayDate === day) {
      res.status(200).json(noOpResponse(playerId, day, existing));
      return;
    }

    const result = applyHandCompleted(existing, playerId, day, yesterday);
    if (result.activity === null) {
      res.status(200).json(noOpResponse(playerId, day, result.player));
      return;
    }

    // Did this advance land exactly on a play milestone? (Reset → 1 and a new
    // player's first → 1 are never rungs, so this is null on those paths.)
    const reward = detectMilestone('play_milestone', result.player.playStreak, now);

    if (reward !== null) {
      // Milestone crossing → ONE atomic TransactWriteCommand (Inv 4): player
      // Update + activity create-or-merge + reward Put. The activity leg's
      // create-or-merge condition is the per-day idempotency gate; a racing
      // duplicate cancels the whole transaction → no-op.
      const committed = await awardMilestone({
        player: {
          playerId,
          axis: 'play',
          isNewPlayer: existing === null,
          date: day,
          yesterday,
          playStreak: result.player.playStreak,
          bestPlayStreak: result.player.bestPlayStreak,
        },
        activity: result.activity,
        reward,
        now,
      });
      if (!committed) {
        const current = (await getPlayer(playerId)) ?? result.player;
        res.status(200).json(noOpResponse(playerId, day, current));
        return;
      }
      logger.info('hand-completed awarded play milestone', {
        playerId,
        tableId: body.tableId,
        handId: body.handId,
        date: day,
        playStreak: result.player.playStreak,
        milestone: reward.milestone,
        points: reward.points,
        rewardId: reward.rewardId,
      });
      res.status(200).json(advancedResponse(playerId, day, result.player.playStreak, reward));
      return;
    }

    // Non-milestone advance (the common case) → cheap plain writes.
    // The activity merge is the idempotency gate (Inv 2, pattern E). If the day
    // already has `played=true` (a racing duplicate beat us), treat as a
    // same-day no-op and return the current state rather than double-advancing.
    const firstHandToday = await mergePlayed({
      playerId,
      date: day,
      playStreakAtDay: result.activity.playStreakAtDay,
      loginStreakAtDay: result.activity.loginStreakAtDay,
      loggedIn: result.activity.loggedIn,
      streakBroken: result.activity.streakBroken,
      now,
    });
    if (!firstHandToday) {
      const current = (await getPlayer(playerId)) ?? result.player;
      res.status(200).json(noOpResponse(playerId, day, current));
      return;
    }

    await persistPlayer(existing, result.player, day, yesterday, now);

    logger.info('hand-completed advanced play streak', {
      playerId,
      tableId: body.tableId,
      handId: body.handId,
      date: day,
      playStreak: result.player.playStreak,
    });

    res.status(200).json(advancedResponse(playerId, day, result.player.playStreak, null));
  } catch (err) {
    logger.error('hand-completed failed', { playerId, err });
    res.status(500).json({ error: 'InternalError', message: 'Hand-completed failed' });
  }
}

/** Persist the advanced player record via the right play-axis conditional write. */
async function persistPlayer(
  existing: PlayerStreak | null,
  next: PlayerStreak,
  day: string,
  yesterday: string,
  now: string,
): Promise<void> {
  if (existing === null) {
    await createPlayer(next);
    return;
  }
  const common = {
    playerId: next.playerId,
    playStreak: next.playStreak,
    bestPlayStreak: next.bestPlayStreak,
    day,
    now,
  };
  if (existing.lastPlayDate === yesterday) {
    await advancePlayStreak({ ...common, yesterday });
  } else {
    await resetPlayStreak(common);
  }
}

/**
 * Build the advancing 200 response. `milestoneEarned` carries the play-milestone
 * reward ONLY on the call that earned it (API_CONTRACT.md §4.6); a non-milestone
 * advance passes `null`.
 */
function advancedResponse(
  playerId: string,
  day: string,
  playStreak: number,
  reward: RewardRecord | null,
): HandCompletedResponse {
  return {
    playerId,
    date: day,
    playStreakUpdated: true,
    playStreak,
    milestoneEarned: reward,
  };
}

/** Build a same-day no-op response from the current player state. */
function noOpResponse(
  playerId: string,
  day: string,
  player: PlayerStreak | null,
): HandCompletedResponse {
  return {
    playerId,
    date: day,
    playStreakUpdated: false,
    playStreak: player?.playStreak ?? 0,
    milestoneEarned: null,
  };
}

/**
 * Validate the §4.6 body: all four fields required; `playerId`/`handId`
 * non-empty strings, `tableId` a number, `completedAt` an ISO-8601 instant.
 * Returns the typed body, or `null` for any violation (→ 400).
 */
function validateBody(raw: unknown): HandCompletedBody | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const b = raw as Record<string, unknown>;
  const { playerId, tableId, handId, completedAt } = b;

  if (typeof playerId !== 'string' || playerId.trim() === '') {
    return null;
  }
  if (typeof tableId !== 'number' || !Number.isFinite(tableId)) {
    return null;
  }
  if (typeof handId !== 'string' || handId.trim() === '') {
    return null;
  }
  if (typeof completedAt !== 'string' || !isIsoInstant(completedAt)) {
    return null;
  }
  return { playerId, tableId, handId, completedAt };
}
