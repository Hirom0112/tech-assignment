/**
 * Integration test (S7-1, API_CONTRACT.md §2/§3): supertest against the real
 * Express `app`. Verifies the canonical error wiring end to end on the running
 * app — the unmatched-route 404 and the §2 auth-before-404 ordering.
 *
 * No DynamoDB rows are touched (these paths fail before any IO), so no seeding.
 */
import request from 'supertest';

import { app } from '../../handler';

describe('integration — canonical error routing (§3 shape, §2 ordering)', () => {
  it('unknown path WITH a valid X-Player-Id → 404 {error:"NotFound"} (canonical shape)', async () => {
    const res = await request(app).get('/api/v1/bogus').set('X-Player-Id', 'p-routing-1');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
    expect(typeof res.body.message).toBe('string');
    // Canonical shape only — never the old `{error:'Not found'}`.
    expect(Object.keys(res.body).sort()).toEqual(['error', 'message']);
    expect(res.body.error).not.toBe('Not found');
  });

  it('unknown path with NO auth → still 404 (catch-all reached after route matching, §2)', async () => {
    // A totally unknown path `/api/v1/bogus` matches NO mounted route, so it is
    // never gated by `authMiddleware`; it lands on the catch-all → 404. This is
    // the documented real behavior: auth-before-404 applies to *mounted* player
    // routes, not to paths that match no route at all.
    const res = await request(app).get('/api/v1/bogus');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  it('auth-before-404 (§2): a player route with NO X-Player-Id → 401, not 404', async () => {
    // `/api/v1/player/streaks` IS a mounted route; its `authMiddleware` runs and
    // throws Unauthorized before any handler/404 — so a missing header is 401.
    const res = await request(app).get('/api/v1/player/streaks');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', message: 'X-Player-Id header is required' });
  });

  it('internal route with NO secret → 403 Forbidden (canonical shape)', async () => {
    const res = await request(app)
      .post('/internal/streaks/hand-completed')
      .set('Content-Type', 'application/json')
      .send({ playerId: 'p', tableId: 1, handId: 'h', completedAt: '2026-02-20T14:30:00Z' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(Object.keys(res.body).sort()).toEqual(['error', 'message']);
  });
});
