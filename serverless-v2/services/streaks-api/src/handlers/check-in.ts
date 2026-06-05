/**
 * POST /api/v1/player/streaks/check-in (FR-5.2, NFR-2) — record today's login.
 *
 * THIN handler (Inv 6): computes today/yesterday ONCE at the edge (Inv 1),
 * loads the player, calls the pure streak service, then persists via the
 * repository's conditional writes. No `docClient` here, no streak math here.
 *
 * Idempotency: the activity row's `attribute_not_exists(#date)` write is the
 * source of truth (Inv 2). A same-day repeat is a 200 no-op (streakAdvanced
 * false), never a 409.
 *
 * S1 wires `freezeConsumed: false` (freeze is S4) and `milestoneEarned: null`
 * (reward awarding is S3).
 */
import type { Request, Response } from 'express';

import {
  advanceLoginStreak,
  createPlayer,
  getPlayer,
  putActivity,
  resetLoginStreak,
} from '../repositories/dynamo.repository';
import { applyLoginCheckIn } from '../services/streak.service';
import { toStreaksResponse, zeroStreaksResponse } from './presenter';
import { nowIso, utcDay, yesterday as priorDay } from '../lib/utc';
import { logger } from '../../shared/config/logger';
import type { CheckInResponse, PlayerStreak } from '../domain/types';

export async function checkInHandler(req: Request, res: Response): Promise<void> {
  const playerId = req.playerId;
  if (playerId === undefined) {
    res.status(401).json({ error: 'Unauthorized', message: 'X-Player-Id header is required' });
    return;
  }

  // Day-math computed once at the edge (Inv 1).
  const now = nowIso();
  const today = utcDay(now);
  const yesterday = priorDay(today);

  try {
    const existing = await getPlayer(playerId);

    // Same-day repeat → idempotent 200 no-op (no write).
    if (existing !== null && existing.lastLoginDate === today) {
      res.status(200).json(noOpResponse(playerId, existing));
      return;
    }

    const result = applyLoginCheckIn(existing, playerId, today, yesterday);
    // The service only returns streakAdvanced:false for the same-day path,
    // already handled above; here it is always an advancing result.
    if (result.activity === null) {
      res.status(200).json(noOpResponse(playerId, result.player));
      return;
    }

    // Activity write is the idempotency gate (Inv 2). If the row already exists
    // (a racing duplicate beat us), treat as a same-day no-op and return the
    // current state rather than double-advancing.
    const firstToday = await putActivity(result.activity);
    if (!firstToday) {
      const current = (await getPlayer(playerId)) ?? result.player;
      res.status(200).json(noOpResponse(playerId, current));
      return;
    }

    await persistPlayer(existing, result.player, today, yesterday, now);

    res.status(200).json({
      playerId,
      checkedInToday: true,
      streakAdvanced: true,
      freezeConsumed: false,
      streaks: toStreaksResponse(result.player),
      milestoneEarned: null,
    });
  } catch (err) {
    logger.error('check-in failed', { playerId, err });
    res.status(500).json({ error: 'InternalError', message: 'Check-in failed' });
  }
}

/** Persist the advanced player record via the right conditional write. */
async function persistPlayer(
  existing: PlayerStreak | null,
  next: PlayerStreak,
  today: string,
  yesterday: string,
  now: string,
): Promise<void> {
  if (existing === null) {
    await createPlayer(next);
    return;
  }
  const common = {
    playerId: next.playerId,
    loginStreak: next.loginStreak,
    bestLoginStreak: next.bestLoginStreak,
    today,
    now,
  };
  if (existing.lastLoginDate === yesterday) {
    await advanceLoginStreak({ ...common, yesterday });
  } else {
    await resetLoginStreak(common);
  }
}

/** Build a same-day no-op response from the current player state. */
function noOpResponse(playerId: string, player: PlayerStreak | null): CheckInResponse {
  return {
    playerId,
    checkedInToday: true,
    streakAdvanced: false,
    freezeConsumed: false,
    streaks: player === null ? zeroStreaksResponse() : toStreaksResponse(player),
    milestoneEarned: null,
  };
}
