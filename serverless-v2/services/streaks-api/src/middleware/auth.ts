import type { Request, Response, NextFunction } from 'express';

import { UnauthorizedError } from './error';

/**
 * Stub player-auth middleware (Inv 10).
 *
 * Extracts the player id from the `X-Player-Id` header onto `req.playerId`.
 * JWT verification is intentionally stubbed for the challenge; the header is
 * the player identity. Missing header → throws `UnauthorizedError`, which the
 * error middleware (S7-1) projects to the canonical 401 `{error,message}` shape.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const playerId = req.headers['x-player-id'];

  if (!playerId || typeof playerId !== 'string') {
    throw new UnauthorizedError('X-Player-Id header is required');
  }

  req.playerId = playerId;
  next();
}
