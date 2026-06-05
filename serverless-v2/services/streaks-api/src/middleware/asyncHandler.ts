/**
 * Async-handler adapter (S7-1).
 *
 * Express 4 does NOT forward a rejected promise from an `async` route handler to
 * the error middleware — an unhandled rejection would escape instead. This thin
 * wrapper awaits the handler and routes any thrown/rejected error to `next(err)`
 * so the single error-normalizing middleware (`error.ts`) sees every failure and
 * emits the canonical §3 `{error,message}` shape. Synchronous throws (e.g. the
 * auth middlewares) are already forwarded by Express, so they don't need this.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
