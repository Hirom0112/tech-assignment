/**
 * Integration test (CLAUDE.md §3 adapted scope for handlers): supertest against
 * the real Express `app` + live DynamoDB Local (localhost:8000, env set in
 * jest.setup.ts). Exercises the full check-in → streak-read flow end to end.
 *
 * Each run uses a UNIQUE random playerId so reruns never collide with prior
 * rows (no teardown needed; rows are retained per DATA_MODEL.md §10).
 */
import request from 'supertest';

import { app } from '../../handler';

const PLAYER_ID = `test-s1-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const UNSEEN_ID = `test-s1-unseen-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe('integration — check-in → streak read', () => {
  it('new player POST check-in → 200, streakAdvanced:true, loginStreak:1', async () => {
    const res = await request(app)
      .post('/api/v1/player/streaks/check-in')
      .set('X-Player-Id', PLAYER_ID);

    expect(res.status).toBe(200);
    expect(res.body.playerId).toBe(PLAYER_ID);
    expect(res.body.checkedInToday).toBe(true);
    expect(res.body.streakAdvanced).toBe(true);
    expect(res.body.freezeConsumed).toBe(false);
    expect(res.body.milestoneEarned).toBeNull();
    expect(res.body.streaks.loginStreak).toBe(1);
    expect(res.body.streaks.bestLoginStreak).toBe(1);
    expect(res.body.streaks.lastLoginDate).not.toBeNull();
    expect(res.body.streaks.nextLoginMilestone).toEqual({
      days: 3,
      reward: 50,
      daysRemaining: 2,
    });
  });

  // SM-5(a): a duplicate same-day check-in does NOT double-increment the streak
  // (loginStreak stays 1; the activity row's attribute_not_exists gate, Inv 2).
  it('SM-5(a) same-day repeat POST check-in → 200, streakAdvanced:false (idempotent no-op)', async () => {
    const res = await request(app)
      .post('/api/v1/player/streaks/check-in')
      .set('X-Player-Id', PLAYER_ID);

    expect(res.status).toBe(200);
    expect(res.body.streakAdvanced).toBe(false);
    expect(res.body.checkedInToday).toBe(true);
    expect(res.body.streaks.loginStreak).toBe(1);
    expect(res.body.milestoneEarned).toBeNull();
  });

  it('GET /player/streaks → 200, loginStreak:1', async () => {
    const res = await request(app)
      .get('/api/v1/player/streaks')
      .set('X-Player-Id', PLAYER_ID);

    expect(res.status).toBe(200);
    expect(res.body.loginStreak).toBe(1);
    expect(res.body.bestLoginStreak).toBe(1);
    expect(res.body.lastLoginDate).not.toBeNull();
  });

  it('unseen player GET /player/streaks → 200, all-zero state, null dates', async () => {
    const res = await request(app)
      .get('/api/v1/player/streaks')
      .set('X-Player-Id', UNSEEN_ID);

    expect(res.status).toBe(200);
    expect(res.body.loginStreak).toBe(0);
    expect(res.body.playStreak).toBe(0);
    expect(res.body.bestLoginStreak).toBe(0);
    expect(res.body.freezesAvailable).toBe(0);
    expect(res.body.lastLoginDate).toBeNull();
    expect(res.body.lastPlayDate).toBeNull();
    expect(res.body.nextLoginMilestone).toEqual({ days: 3, reward: 50, daysRemaining: 3 });
    expect(res.body.nextPlayMilestone).toEqual({ days: 3, reward: 100, daysRemaining: 3 });
  });

  it('missing X-Player-Id → 401 canonical error shape', async () => {
    const res = await request(app).get('/api/v1/player/streaks');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: 'Unauthorized',
      message: 'X-Player-Id header is required',
    });
  });
});
