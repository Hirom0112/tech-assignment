/**
 * Integration test (CLAUDE.md §3 adapted scope; S8-2/S8-3, FR-8) — supertest
 * against the real Express `app` + live DynamoDB Local (localhost:8000, env in
 * jest.setup.ts). Drives the admin view-history composite endpoint
 * (`GET /api/v1/admin/streaks/players/:id/history`, API_CONTRACT.md §4.8):
 *
 *   - a valid `X-Internal-Secret` ⇒ `200` with the composite
 *     `{ player, activity, rewards, freezes }`:
 *       · `player`  = the §4.1 nine-field streaks object;
 *       · `activity`= per-day rows ({date,activity,loginStreak,playStreak}),
 *         ascending by date, over the recent 60-day window;
 *       · `rewards` = §4.4 reward objects newest-first, incl. the full
 *         5-field `notification` payload (FR-7 audit);
 *       · `freezes` = §4.5 balance summary + consumption history;
 *   - missing/bad secret ⇒ `403` (BEFORE any player lookup, §3 / Inv 10);
 *   - unknown player ⇒ `404` (NotFound).
 *
 * "Today" is real UTC today; we seed dates RELATIVE to today via raw docClient
 * writes (test-only fixture, Inv 6 is about app code). Unique random playerId
 * per run so reruns never collide.
 */
import request from 'supertest';
import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

import { app } from '../../handler';
import { docClient } from '../../shared/config/dynamo';
import { buildMilestoneReward } from '../../src/services/reward.service';
import { nowIso, utcDay, yesterday as priorDay } from '../../src/lib/utc';
import type { ActivityDay, FreezeRecord, PlayerStreak } from '../../src/domain/types';

process.env.INTERNAL_API_SECRET ??= 'dev-internal-secret';

const PLAYERS_TABLE = process.env.STREAKS_PLAYERS_TABLE ?? 'streaks-players';
const ACTIVITY_TABLE = process.env.STREAKS_ACTIVITY_TABLE ?? 'streaks-activity';
const REWARDS_TABLE = process.env.STREAKS_REWARDS_TABLE ?? 'streaks-rewards';
const FREEZE_HISTORY_TABLE =
  process.env.STREAKS_FREEZE_HISTORY_TABLE ?? 'streaks-freeze-history';
const SECRET = process.env.INTERNAL_API_SECRET as string;

const PLAYER_ID = `test-s8-hist-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const MISSING_ID = `test-s8-missing-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const TODAY = utcDay(nowIso());
const YESTERDAY = priorDay(TODAY);
const TWO_DAYS_AGO = priorDay(YESTERDAY);

const HISTORY_PATH = `/api/v1/admin/streaks/players/${PLAYER_ID}/history`;

/**
 * Seed a fully-populated player: a non-trivial aggregate, two recent activity
 * rows, one earned login reward (carrying the FR-7 notification), and one
 * consumed-freeze history row.
 */
async function seedPlayer(): Promise<void> {
  const player: PlayerStreak = {
    playerId: PLAYER_ID,
    loginStreak: 12,
    playStreak: 5,
    bestLoginStreak: 45,
    bestPlayStreak: 22,
    lastLoginDate: TODAY,
    lastPlayDate: YESTERDAY,
    freezesAvailable: 2,
    freezesUsedThisMonth: 1,
    lastFreezeGrantDate: TODAY.slice(0, 7),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await docClient.send(new PutCommand({ TableName: PLAYERS_TABLE, Item: player }));

  const yesterdayRow: ActivityDay = {
    playerId: PLAYER_ID,
    date: YESTERDAY,
    loggedIn: true,
    played: false,
    freezeUsed: false,
    streakBroken: false,
    loginStreakAtDay: 11,
    playStreakAtDay: 0,
    timestamp: nowIso(),
  };
  const todayRow: ActivityDay = {
    playerId: PLAYER_ID,
    date: TODAY,
    loggedIn: true,
    played: true,
    freezeUsed: false,
    streakBroken: false,
    loginStreakAtDay: 12,
    playStreakAtDay: 5,
    timestamp: nowIso(),
  };
  await docClient.send(new PutCommand({ TableName: ACTIVITY_TABLE, Item: yesterdayRow }));
  await docClient.send(new PutCommand({ TableName: ACTIVITY_TABLE, Item: todayRow }));

  const reward = buildMilestoneReward('login_milestone', 7, nowIso());
  await docClient.send(
    new PutCommand({
      TableName: REWARDS_TABLE,
      Item: { playerId: PLAYER_ID, ...reward, pointTxnType: 'streak_bonus' },
    }),
  );

  const freeze: FreezeRecord = {
    playerId: PLAYER_ID,
    date: TWO_DAYS_AGO,
    source: 'purchased',
    createdAt: nowIso(),
  };
  await docClient.send(new PutCommand({ TableName: FREEZE_HISTORY_TABLE, Item: freeze }));
}

beforeAll(async () => {
  await seedPlayer();
});

afterAll(async () => {
  await docClient.send(new DeleteCommand({ TableName: PLAYERS_TABLE, Key: { playerId: PLAYER_ID } }));
  await docClient.send(new DeleteCommand({ TableName: ACTIVITY_TABLE, Key: { playerId: PLAYER_ID, date: TODAY } }));
  await docClient.send(new DeleteCommand({ TableName: ACTIVITY_TABLE, Key: { playerId: PLAYER_ID, date: YESTERDAY } }));
  await docClient.send(new DeleteCommand({ TableName: FREEZE_HISTORY_TABLE, Key: { playerId: PLAYER_ID, date: TWO_DAYS_AGO } }));
});

describe('integration — admin player-history composite (S8-2/S8-3, §4.8)', () => {
  it('valid secret ⇒ 200 with composite {player, activity, rewards, freezes}', async () => {
    const res = await request(app).get(HISTORY_PATH).set('X-Internal-Secret', SECRET);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['activity', 'freezes', 'player', 'rewards']);
  });

  it('player ⇒ the §4.1 nine-field streaks object', async () => {
    const res = await request(app).get(HISTORY_PATH).set('X-Internal-Secret', SECRET);
    const p = res.body.player;
    expect(Object.keys(p).sort()).toEqual(
      [
        'bestLoginStreak',
        'bestPlayStreak',
        'freezesAvailable',
        'lastLoginDate',
        'lastPlayDate',
        'loginStreak',
        'nextLoginMilestone',
        'nextPlayMilestone',
        'playStreak',
      ].sort(),
    );
    expect(p.loginStreak).toBe(12);
    expect(p.playStreak).toBe(5);
    expect(p.bestLoginStreak).toBe(45);
    expect(p.freezesAvailable).toBe(2);
    expect(p.lastLoginDate).toBe(TODAY);
    // The §4.1 object never leaks the internal player-table fields.
    expect(p.playerId).toBeUndefined();
    expect(p.freezesUsedThisMonth).toBeUndefined();
  });

  it('activity ⇒ recent per-day rows {date,activity,loginStreak,playStreak}, ascending', async () => {
    const res = await request(app).get(HISTORY_PATH).set('X-Internal-Secret', SECRET);
    const activity = res.body.activity as Array<Record<string, unknown>>;
    expect(Array.isArray(activity)).toBe(true);

    const todayEntry = activity.find((d) => d.date === TODAY);
    const yesterdayEntry = activity.find((d) => d.date === YESTERDAY);
    expect(todayEntry).toBeDefined();
    expect(yesterdayEntry).toBeDefined();
    expect(Object.keys(todayEntry as object).sort()).toEqual(
      ['activity', 'date', 'loginStreak', 'playStreak'].sort(),
    );
    expect(todayEntry?.activity).toBe('played');
    expect(todayEntry?.loginStreak).toBe(12);
    expect(yesterdayEntry?.activity).toBe('login_only');

    // Ascending by date (the only ordering guarantee §4.8 makes).
    const dates = activity.map((d) => d.date as string);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it('rewards ⇒ §4.4 objects newest-first carrying the full 5-field notification (FR-7)', async () => {
    const res = await request(app).get(HISTORY_PATH).set('X-Internal-Secret', SECRET);
    const rewards = res.body.rewards as Array<Record<string, unknown>>;
    expect(Array.isArray(rewards)).toBe(true);
    expect(rewards.length).toBeGreaterThanOrEqual(1);

    const reward = rewards[0];
    expect(Object.keys(reward).sort()).toEqual(
      ['createdAt', 'milestone', 'notification', 'points', 'rewardId', 'streakCount', 'type'].sort(),
    );
    // The internal ledger field is never surfaced (§5.4).
    expect(reward.pointTxnType).toBeUndefined();

    const notification = reward.notification as Record<string, unknown>;
    expect(Object.keys(notification).sort()).toEqual(
      ['body', 'deepLink', 'milestone', 'title', 'type'].sort(),
    );
    expect(notification.deepLink).toBe('hijackpoker://streaks');
  });

  it('freezes ⇒ §4.5 balance summary + consumption history', async () => {
    const res = await request(app).get(HISTORY_PATH).set('X-Internal-Secret', SECRET);
    const freezes = res.body.freezes;
    expect(Object.keys(freezes).sort()).toEqual(
      ['freezesAvailable', 'freezesUsedThisMonth', 'history', 'lastFreezeGrantDate'].sort(),
    );
    expect(freezes.freezesAvailable).toBe(2);
    expect(freezes.freezesUsedThisMonth).toBe(1);
    const row = (freezes.history as Array<{ date: string; source: string }>).find(
      (h) => h.date === TWO_DAYS_AGO,
    );
    expect(row).toBeDefined();
    expect(row?.source).toBe('purchased');
    // The wire surfaces only {date, source} (no internal createdAt/PK).
    expect(Object.keys(row as object).sort()).toEqual(['date', 'source']);
  });

  it('missing secret ⇒ 403 BEFORE any player lookup (Inv 10)', async () => {
    const res = await request(app).get(HISTORY_PATH);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('bad secret ⇒ 403 (even for an existing player)', async () => {
    const res = await request(app).get(HISTORY_PATH).set('X-Internal-Secret', 'wrong-secret');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('bad secret on an UNKNOWN player ⇒ still 403 (403 wins before the 404 lookup)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/streaks/players/${MISSING_ID}/history`)
      .set('X-Internal-Secret', 'wrong-secret');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('unknown player (valid secret) ⇒ 404 NotFound', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/streaks/players/${MISSING_ID}/history`)
      .set('X-Internal-Secret', SECRET);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });
});
