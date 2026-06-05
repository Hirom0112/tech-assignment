/**
 * Correlation-id middleware (S7-2, NFR-6, ARCHITECTURE §8).
 *
 * Generates a per-request `correlationId` and attaches it to `req` so every
 * write-path log line (check-in, hand-completed, reward award, freeze consume,
 * admin grant) can be tied back to a single request. Honors an inbound
 * `X-Correlation-Id` header when present (server-to-server tracing), otherwise
 * mints a fresh one. Echoes it back on the response header for the caller.
 *
 * Zero-dep id generation (STND-5: no `uuid`): `crypto.randomUUID()` from the
 * node stdlib — no new dependency.
 */
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/** Attach a `correlationId` to the request (inbound header or a fresh UUID). */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers['x-correlation-id'];
  const correlationId = typeof inbound === 'string' && inbound.trim() !== '' ? inbound : randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
}
