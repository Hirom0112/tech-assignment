/**
 * Unit tests for the error-normalizing middleware (S7-1, API_CONTRACT.md §3).
 *
 * One test per §3 code path (400/401/403/404/409/500) asserting the EXACT
 * canonical `{error:'<Label>', message}` body + status. Plus: an unknown /
 * unexpected error (incl. a raw DynamoDB-shaped failure) collapses to 500
 * `InternalError` with a GENERIC message that never leaks the internal detail.
 */
import type { Request, Response, NextFunction } from 'express';

import {
  errorHandler,
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalError,
} from '../../src/middleware/error';

/** A minimal `res` double capturing the status + json body. */
function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

const REQ = { correlationId: 'corr-test', playerId: 'p-test' } as unknown as Request;
const NEXT = jest.fn() as unknown as NextFunction;

describe('middleware/error — §3 error catalogue (one per code path)', () => {
  const cases: Array<[string, ApiError, number, string]> = [
    ['BadRequest', new BadRequestError('bad month'), 400, 'BadRequest'],
    ['Unauthorized', new UnauthorizedError('X-Player-Id header is required'), 401, 'Unauthorized'],
    ['Forbidden', new ForbiddenError('Valid X-Internal-Secret header is required'), 403, 'Forbidden'],
    ['NotFound', new NotFoundError('No route for GET /x'), 404, 'NotFound'],
    ['Conflict', new ConflictError('over cap'), 409, 'Conflict'],
    ['InternalError', new InternalError(), 500, 'InternalError'],
  ];

  it.each(cases)('%s → exact status + {error,message} shape', (_name, err, status, label) => {
    const res = mockRes();
    errorHandler(err, REQ, res, NEXT);

    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({ error: label, message: err.message });
    // Canonical shape: ONLY `error` and `message`, nothing else (§1, §3).
    expect(Object.keys(res.body as object).sort()).toEqual(['error', 'message']);
  });

  it('400 carries the thrown human message verbatim', () => {
    const res = mockRes();
    errorHandler(new BadRequestError("Query param 'month' must match YYYY-MM"), REQ, res, NEXT);
    expect(res.body).toEqual({
      error: 'BadRequest',
      message: "Query param 'month' must match YYYY-MM",
    });
  });

  it('unknown/unexpected error → 500 InternalError with a GENERIC, non-leaking message', () => {
    const res = mockRes();
    // A raw DynamoDB-shaped failure carrying a sensitive internal detail.
    const ddbError = Object.assign(new Error('Cannot read table arn:aws:dynamodb:secret'), {
      name: 'ResourceNotFoundException',
    });

    errorHandler(ddbError, REQ, res, NEXT);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'InternalError', message: 'An unexpected error occurred' });
    // The internal detail is NEVER surfaced on the wire (NFR-7).
    expect(JSON.stringify(res.body)).not.toContain('arn:aws:dynamodb');
    expect(JSON.stringify(res.body)).not.toContain('ResourceNotFoundException');
  });

  it('a non-Error thrown value (e.g. a string) still → 500 InternalError', () => {
    const res = mockRes();
    errorHandler('boom', REQ, res, NEXT);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'InternalError', message: 'An unexpected error occurred' });
  });
});
