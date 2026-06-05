/**
 * GET /api/v1/player/streaks/rewards (FR-5.4, API_CONTRACT.md §4.4) — the
 * player's earned milestone rewards (reward-history UI, FR-4.7).
 *
 * THIN handler (Inv 6): HTTP only. It loads the rewards via the repository's
 * `queryRewards` (a single `Query` with `ScanIndexForward=false`, newest-first —
 * never a `Scan`, NFR-8) and returns them as a TOP-LEVEL JSON array. Each
 * element is the §4.4 shape including the `notification` payload. An empty
 * history is `200` with `[]` (never 404). No `docClient` here.
 *
 * The stored reward row also carries `pointTxnType:'streak_bonus'` (the folded
 * point-txn, DATA_MODEL.md §4) — an internal ledger field that is NOT surfaced
 * here; the presenter projects only the §4.4 wire fields.
 */
import type { Request, Response } from 'express';

import { queryRewards } from '../repositories/dynamo.repository';
import { toRewardWire } from './presenter';
import { logger } from '../../shared/config/logger';

export async function getRewardsHandler(req: Request, res: Response): Promise<void> {
  const playerId = req.playerId;
  if (playerId === undefined) {
    res.status(401).json({ error: 'Unauthorized', message: 'X-Player-Id header is required' });
    return;
  }
  try {
    const rewards = await queryRewards(playerId);
    res.status(200).json(rewards.map(toRewardWire));
  } catch (err) {
    logger.error('getRewards failed', { playerId, err });
    res.status(500).json({ error: 'InternalError', message: 'Failed to load rewards' });
  }
}
