/**
 * GET /api/v1/player/streaks (FR-5.1) — the current streak view.
 *
 * THIN handler (Inv 6): HTTP only. It loads the player via the repository and
 * maps to the API_CONTRACT.md §4.1 nine-field shape. No `docClient` here, no
 * day-math beyond the single edge computation. A never-seen player returns the
 * canonical zero-state 200 (ASSUMPTIONS), never 404.
 */
import type { Request, Response } from 'express';

import { getPlayer } from '../repositories/dynamo.repository';
import { toStreaksResponse, zeroStreaksResponse } from './presenter';
import { logger } from '../../shared/config/logger';

export async function getStreaksHandler(req: Request, res: Response): Promise<void> {
  const playerId = req.playerId;
  if (playerId === undefined) {
    res.status(401).json({ error: 'Unauthorized', message: 'X-Player-Id header is required' });
    return;
  }
  try {
    const player = await getPlayer(playerId);
    const body = player === null ? zeroStreaksResponse() : toStreaksResponse(player);
    res.status(200).json(body);
  } catch (err) {
    logger.error('getStreaks failed', { playerId, err });
    res.status(500).json({ error: 'InternalError', message: 'Failed to load streaks' });
  }
}
