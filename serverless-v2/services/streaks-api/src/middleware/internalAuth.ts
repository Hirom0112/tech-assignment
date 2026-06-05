import type { Request, Response, NextFunction } from 'express';

import { ForbiddenError } from './error';

/**
 * Internal/admin auth middleware (Inv 10).
 *
 * Guards internal endpoints (e.g. POST /internal/streaks/hand-completed) and
 * the admin view-history endpoint with the shared `INTERNAL_API_SECRET`,
 * supplied via the `X-Internal-Secret` header. This is NOT player auth —
 * it must never sit on the player-auth surface.
 *
 * Missing or mismatched secret → throws `ForbiddenError`, which the error
 * middleware (S7-1) projects to the canonical 403 `{error,message}` shape.
 */
export function internalAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.headers['x-internal-secret'];
  const expected = process.env.INTERNAL_API_SECRET;

  if (!expected || provided !== expected) {
    throw new ForbiddenError('Valid X-Internal-Secret header is required');
  }

  next();
}
