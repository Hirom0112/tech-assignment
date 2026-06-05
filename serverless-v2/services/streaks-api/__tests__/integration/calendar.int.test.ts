/**
 * Integration test (CLAUDE.md §3 adapted scope for handlers): supertest against
 * the real Express `app` + live DynamoDB Local. Exercises the calendar endpoint
 * end to end (FR-5.3, API_CONTRACT.md §4.3) — the dense `{month, days[]}` shape,
 * malformed-month 400, omitted-month default, and the 401 auth gate.
 *
 * Each run uses a UNIQUE random playerId so reruns never collide.
 */
import request from 'supertest';
import { DateTime } from 'luxon';

import { app } from '../../handler';

const PLAYER_ID = `test-s5-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const CURRENT_MONTH = DateTime.utc().toFormat('yyyy-MM');
const TODAY = DateTime.utc().toISODate();

describe('integration — calendar (FR-5.3, §4.3)', () => {
  it('check-in then GET calendar?month=<current> → 200, dense days[], today is login_only', async () => {
    await request(app).post('/api/v1/player/streaks/check-in').set('X-Player-Id', PLAYER_ID);

    const res = await request(app)
      .get(`/api/v1/player/streaks/calendar?month=${CURRENT_MONTH}`)
      .set('X-Player-Id', PLAYER_ID);

    expect(res.status).toBe(200);
    expect(res.body.month).toBe(CURRENT_MONTH);
    expect(Array.isArray(res.body.days)).toBe(true);
    // one entry per calendar day, ascending.
    const expectedDays =
      DateTime.fromFormat(CURRENT_MONTH, 'yyyy-MM', { zone: 'utc' }).daysInMonth ?? 0;
    expect(res.body.days).toHaveLength(expectedDays);
    expect(res.body.days[0].date).toBe(`${CURRENT_MONTH}-01`);

    const todayEntry = res.body.days.find((d: { date: string }) => d.date === TODAY);
    expect(todayEntry).toBeDefined();
    // The check-in (no hand) makes today a login_only day with loginStreak ≥ 1.
    expect(todayEntry.activity).toBe('login_only');
    expect(todayEntry.loginStreak).toBeGreaterThanOrEqual(1);

    // Every entry has the §4.3 fields.
    for (const d of res.body.days) {
      expect(d).toEqual(
        expect.objectContaining({
          date: expect.any(String),
          activity: expect.any(String),
          loginStreak: expect.any(Number),
          playStreak: expect.any(Number),
        }),
      );
    }
  });

  it('omitted month defaults to the current UTC month → 200', async () => {
    const res = await request(app)
      .get('/api/v1/player/streaks/calendar')
      .set('X-Player-Id', PLAYER_ID);

    expect(res.status).toBe(200);
    expect(res.body.month).toBe(CURRENT_MONTH);
  });

  it('malformed month (2026-13) → 400 canonical error shape', async () => {
    const res = await request(app)
      .get('/api/v1/player/streaks/calendar?month=2026-13')
      .set('X-Player-Id', PLAYER_ID);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BadRequest');
  });

  it('malformed month (feb) → 400', async () => {
    const res = await request(app)
      .get('/api/v1/player/streaks/calendar?month=feb')
      .set('X-Player-Id', PLAYER_ID);
    expect(res.status).toBe(400);
  });

  it('alias /api/v1/streaks/calendar works the same', async () => {
    const res = await request(app)
      .get(`/api/v1/streaks/calendar?month=${CURRENT_MONTH}`)
      .set('X-Player-Id', PLAYER_ID);
    expect(res.status).toBe(200);
    expect(res.body.month).toBe(CURRENT_MONTH);
  });

  it('missing X-Player-Id → 401 canonical error shape', async () => {
    const res = await request(app).get('/api/v1/player/streaks/calendar');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', message: 'X-Player-Id header is required' });
  });
});
