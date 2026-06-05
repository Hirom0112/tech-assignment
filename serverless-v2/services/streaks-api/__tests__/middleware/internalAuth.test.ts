import type { Request, Response, NextFunction } from 'express';
import { internalAuthMiddleware } from '../../src/middleware/internalAuth';
import { ForbiddenError } from '../../src/middleware/error';

/** A bare `res` stub — the middleware never touches it (it throws on failure). */
function mockRes(): Response {
  return {} as Response;
}

describe('middleware/internalAuth (Inv 10)', () => {
  const ORIGINAL = process.env.INTERNAL_API_SECRET;

  beforeAll(() => {
    process.env.INTERNAL_API_SECRET = 'dev-internal-secret';
  });

  afterAll(() => {
    process.env.INTERNAL_API_SECRET = ORIGINAL;
  });

  it('throws ForbiddenError when the secret is missing (→ error mw maps to 403)', () => {
    const req = { headers: {} } as Request;
    const next = jest.fn() as unknown as NextFunction;

    expect(() => internalAuthMiddleware(req, mockRes(), next)).toThrow(ForbiddenError);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError when the secret is wrong', () => {
    const req = { headers: { 'x-internal-secret': 'nope' } } as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;

    expect(() => internalAuthMiddleware(req, mockRes(), next)).toThrow(ForbiddenError);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when the secret matches', () => {
    const req = { headers: { 'x-internal-secret': 'dev-internal-secret' } } as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;

    internalAuthMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
