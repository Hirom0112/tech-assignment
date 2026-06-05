/**
 * Error-normalizing middleware (S7-1, CLAUDE.md Inv 7, API_CONTRACT.md §3).
 *
 * The single Express error handler (the last `app.use((err,req,res,next)=>…)`).
 * Every error path in the app throws one of the typed `ApiError` subclasses
 * below; this middleware projects each onto the canonical §3 wire shape
 * `{ error: "<Label>", message: "<human text>" }` with the matching status.
 *
 * Labels ↔ codes (§3 catalogue, exact): BadRequest/400, Unauthorized/401,
 * Forbidden/403, NotFound/404, Conflict/409, InternalError/500. There is no 503
 * (ASSUMPTIONS A-3: a DB-down / unexpected failure → 500 InternalError).
 *
 * Unknown / unexpected errors (anything not an `ApiError`, incl. raw DynamoDB
 * SDK failures) collapse to 500 `InternalError` with a GENERIC message — the
 * real error is logged (with `correlationId`/`playerId` when present) but never
 * leaked on the wire (NFR-7, ARCHITECTURE §7).
 */
import type { Request, Response, NextFunction } from 'express';

import { logger } from '../../shared/config/logger';

/** The six §3 error labels — the only `error` values the wire ever carries. */
export type ErrorLabel =
  | 'BadRequest'
  | 'Unauthorized'
  | 'Forbidden'
  | 'NotFound'
  | 'Conflict'
  | 'InternalError';

/**
 * Base class for every error the app throws on purpose. Each subclass fixes its
 * `status` + `label` so the middleware can emit the §3 shape without a lookup.
 */
export abstract class ApiError extends Error {
  abstract readonly status: number;
  abstract readonly label: ErrorLabel;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 — malformed/missing input (bad month, missing body field, count<=0). */
export class BadRequestError extends ApiError {
  readonly status = 400;
  readonly label = 'BadRequest' as const;
  constructor(message = 'Bad request') {
    super(message);
  }
}

/** 401 — missing/empty `X-Player-Id` on a player endpoint. */
export class UnauthorizedError extends ApiError {
  readonly status = 401;
  readonly label = 'Unauthorized' as const;
  constructor(message = 'X-Player-Id header is required') {
    super(message);
  }
}

/** 403 — missing/invalid `X-Internal-Secret` on an internal/admin endpoint. */
export class ForbiddenError extends ApiError {
  readonly status = 403;
  readonly label = 'Forbidden' as const;
  constructor(message = 'Valid X-Internal-Secret header is required') {
    super(message);
  }
}

/** 404 — unknown route, or a referenced player has no streak record. */
export class NotFoundError extends ApiError {
  readonly status = 404;
  readonly label = 'NotFound' as const;
  constructor(message = 'Not found') {
    super(message);
  }
}

/** 409 — the only documented state conflict (admin grant over the 99 cap). */
export class ConflictError extends ApiError {
  readonly status = 409;
  readonly label = 'Conflict' as const;
  constructor(message = 'Conflict') {
    super(message);
  }
}

/**
 * 500 — explicit internal failure. Carries a SAFE wire message; an optional
 * `cause` holds the real error for logging only (never serialized to the wire).
 */
export class InternalError extends ApiError {
  readonly status = 500;
  readonly label = 'InternalError' as const;
  constructor(message = 'An unexpected error occurred') {
    super(message);
  }
}

/**
 * The Express error handler. MUST be registered LAST (after all routes and the
 * 404 forwarder). The 4-arg signature is what marks it as an error handler to
 * Express; `next` is unused but required for that signature.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const correlationId = req.correlationId;
  const playerId = req.playerId;

  if (err instanceof ApiError) {
    // Client-class errors (4xx) are expected business outcomes — log at info.
    // A thrown 500 (InternalError) is a real server failure — log at error.
    if (err.status >= 500) {
      logger.error('request failed', { correlationId, playerId, label: err.label, message: err.message });
    } else {
      logger.info('request rejected', { correlationId, playerId, label: err.label, status: err.status });
    }
    res.status(err.status).json({ error: err.label, message: err.message });
    return;
  }

  // Unknown/unexpected (incl. raw DynamoDB failures) → 500 InternalError with a
  // generic message. The REAL error is logged here and never leaked (NFR-7).
  // Metric hook (ARCHITECTURE §8): a `streaks.error.unhandled` counter attaches here.
  logger.error('unhandled error', {
    correlationId,
    playerId,
    err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  });
  res.status(500).json({ error: 'InternalError', message: 'An unexpected error occurred' });
}
