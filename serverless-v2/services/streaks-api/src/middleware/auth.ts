import type { Request, Response, NextFunction } from 'express';

/**
 * Stub player-auth middleware (Inv 10).
 *
 * Extracts the player id from the `X-Player-Id` header onto `req.playerId`.
 * JWT verification is intentionally stubbed for the challenge; the header is
 * the player identity. Missing header → 401 with the canonical error shape.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const playerId = req.headers['x-player-id'];

  if (!playerId || typeof playerId !== 'string') {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'X-Player-Id header is required',
    });
    return;
  }

  req.playerId = playerId;
  next();
}
