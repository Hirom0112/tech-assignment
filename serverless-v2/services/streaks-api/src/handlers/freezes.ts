/**
 * GET /api/v1/player/streaks/freezes (FR-5.5, API_CONTRACT.md §4.5) — the
 * player's freeze balance + consumption history for the freeze-status UI (FR-4.6).
 *
 * THIN handler (Inv 6): HTTP only. Loads the player (for the balance summary) and
 * the consumed-freeze history via the repository's `queryFreezeHistory` — a
 * single `Query` with `ScanIndexForward=false`, newest-first by `date`, never a
 * `Scan` (NFR-8). `history` carries only the §4.5 `{date, source}` wire fields;
 * an empty history is `200` with `[]`. A never-seen player returns a zero-balance
 * summary with `[]` (never 404). No `docClient` here.
 */
import type { Request, Response } from 'express';

import { getPlayer, queryFreezeHistory } from '../repositories/dynamo.repository';
import { UnauthorizedError } from '../middleware/error';
import type { FreezesResponse } from '../domain/types';

export async function getFreezesHandler(req: Request, res: Response): Promise<void> {
  const playerId = req.playerId;
  if (playerId === undefined) {
    throw new UnauthorizedError();
  }
  // A DynamoDB failure rejects here → asyncHandler → 500 InternalError (A-3).
  const [player, history] = await Promise.all([
    getPlayer(playerId),
    queryFreezeHistory(playerId),
  ]);
  const body: FreezesResponse = {
    freezesAvailable: player?.freezesAvailable ?? 0,
    freezesUsedThisMonth: player?.freezesUsedThisMonth ?? 0,
    lastFreezeGrantDate: player?.lastFreezeGrantDate ?? null,
    // `queryFreezeHistory` already returns newest-first by the `date` SK; the
    // wire surfaces only `{date, source}` (drops the internal `createdAt`/PK).
    history: history.map((row) => ({ date: row.date, source: row.source })),
  };
  res.status(200).json(body);
}
