/**
 * Integration test (CLAUDE.md §3 adapted scope): supertest against the real
 * Express `app` + live DynamoDB Local (localhost:8000, env in jest.setup.ts).
 * Exercises the full S4 freeze flow end to end:
 *   - a 1-missed-day gap with a freeze ⇒ check-in consumes it, preserves the
 *     streak (9 → 10), `freezeConsumed:true`;
 *   - `GET …/freezes` reflects the lowered balance + a consumption history row;
 *   - admin grant raises the balance; over-cap → 409; missing secret → 403.
 *
 * Each run uses a UNIQUE random playerId so reruns never collide. Seeding uses a
 * raw docClient write with dates RELATIVE to today (we can't move the wall clock)
 * — a test-only fixture, not app code (Inv 6 is about app code).
 *
 * ASSUMPTIONS A-6: supertest `.send(obj)` needs `.set('Content-Type',
 * 'application/json')` first for the JSON body to parse.
 */
import request from 'supertest';
import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

import { app } from '../../handler';
import { docClient } from '../../shared/config/dynamo';
import { nowIso, utcDay, yearMonth, yesterday as priorDay } from '../../src/lib/utc';
import type { PlayerStreak } from '../../src/domain/types';

// The internal/admin guard reads INTERNAL_API_SECRET at request time; set it
// before any request so the valid-secret cases authorize (mirrors the
// hand-completed int test).
process.env.INTERNAL_API_SECRET ??= 'dev-internal-secret';

const PLAYERS_TABLE = process.env.STREAKS_PLAYERS_TABLE ?? 'streaks-players';
const ACTIVITY_TABLE = process.env.STREAKS_ACTIVITY_TABLE ?? 'streaks-activity';
const SECRET = process.env.INTERNAL_API_SECRET as string;

const PLAYER_ID = `test-s4-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const CAP_ID = `test-s4-cap-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const MISSING_ID = `test-s4-missing-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const TODAY = utcDay(nowIso());
const MISSED_DAY = priorDay(TODAY); // yesterday (the single missed day)
const TWO_DAYS_AGO = priorDay(MISSED_DAY); // gap 2 from today

/**
 * Seed a player at `loginStreak`, `lastLoginDate = 2 days ago` (a 1-missed-day
 * gap), `freezesAvailable`, and `lastFreezeGrantDate = this month` (so no monthly
 * grant noise). Clears any lingering `today` / missed-day activity rows.
 */
async function seedGapPlayer(
  playerId: string,
  loginStreak: number,
  freezesAvailable: number,
): Promise<void> {
  const player: PlayerStreak = {
    playerId,
    loginStreak,
    playStreak: 0,
    bestLoginStreak: loginStreak,
    bestPlayStreak: 0,
    lastLoginDate: TWO_DAYS_AGO,
    lastPlayDate: null,
    freezesAvailable,
    freezesUsedThisMonth: 0,
    lastFreezeGrantDate: yearMonth(TODAY),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await docClient.send(new PutCommand({ TableName: PLAYERS_TABLE, Item: player }));
  await docClient.send(
    new DeleteCommand({ TableName: ACTIVITY_TABLE, Key: { playerId, date: TODAY } }),
  );
  await docClient.send(
    new DeleteCommand({ TableName: ACTIVITY_TABLE, Key: { playerId, date: MISSED_DAY } }),
  );
}

describe('integration — freeze protection + admin grant (S4)', () => {
  it('1-missed-day gap + 1 freeze: check-in ⇒ freezeConsumed:true, streak 9 → 10, balance 0', async () => {
    await seedGapPlayer(PLAYER_ID, 9, 1);

    const res = await request(app)
      .post('/api/v1/player/streaks/check-in')
      .set('X-Player-Id', PLAYER_ID);

    expect(res.status).toBe(200);
    expect(res.body.streakAdvanced).toBe(true);
    expect(res.body.freezeConsumed).toBe(true);
    expect(res.body.streaks.loginStreak).toBe(10);
    expect(res.body.streaks.freezesAvailable).toBe(0);
  });

  it('GET …/freezes ⇒ balance 0, freezesUsedThisMonth 1, a history row for the missed day', async () => {
    const res = await request(app)
      .get('/api/v1/player/streaks/freezes')
      .set('X-Player-Id', PLAYER_ID);

    expect(res.status).toBe(200);
    expect(res.body.freezesAvailable).toBe(0);
    expect(res.body.freezesUsedThisMonth).toBe(1);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBeGreaterThanOrEqual(1);
    const row = res.body.history.find((h: { date: string }) => h.date === MISSED_DAY);
    expect(row).toBeDefined();
    expect(['purchased', 'free_monthly']).toContain(row.source);
  });

  it('alias GET /api/v1/streaks/freezes ⇒ same balance', async () => {
    const res = await request(app)
      .get('/api/v1/streaks/freezes')
      .set('X-Player-Id', PLAYER_ID);
    expect(res.status).toBe(200);
    expect(res.body.freezesAvailable).toBe(0);
  });

  it('admin grant count 3 (valid secret) ⇒ 200, granted:3, balance rises to 3', async () => {
    const res = await request(app)
      .post('/api/v1/admin/streaks/freezes/grant')
      .set('Content-Type', 'application/json')
      .set('X-Internal-Secret', SECRET)
      .send({ playerId: PLAYER_ID, count: 3 });

    expect(res.status).toBe(200);
    expect(res.body.playerId).toBe(PLAYER_ID);
    expect(res.body.granted).toBe(3);
    expect(res.body.freezesAvailable).toBe(3); // 0 + 3
    expect(res.body.source).toBe('purchased');
    expect(typeof res.body.updatedAt).toBe('string');
  });

  it('admin grant count 0 ⇒ 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/streaks/freezes/grant')
      .set('Content-Type', 'application/json')
      .set('X-Internal-Secret', SECRET)
      .send({ playerId: PLAYER_ID, count: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BadRequest');
  });

  it('admin grant missing secret ⇒ 403 (never player auth)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/streaks/freezes/grant')
      .set('Content-Type', 'application/json')
      .send({ playerId: PLAYER_ID, count: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('admin grant for an unknown player ⇒ 404', async () => {
    const res = await request(app)
      .post('/api/v1/admin/streaks/freezes/grant')
      .set('Content-Type', 'application/json')
      .set('X-Internal-Secret', SECRET)
      .send({ playerId: MISSING_ID, count: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  it('admin grant that would push the balance over 99 ⇒ 409 Conflict', async () => {
    await seedGapPlayer(CAP_ID, 1, 98); // balance 98; +5 would exceed 99
    const res = await request(app)
      .post('/api/v1/admin/streaks/freezes/grant')
      .set('Content-Type', 'application/json')
      .set('X-Internal-Secret', SECRET)
      .send({ playerId: CAP_ID, count: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Conflict');
  });
});
