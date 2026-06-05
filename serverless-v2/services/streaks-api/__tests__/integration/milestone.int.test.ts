/**
 * Integration test (CLAUDE.md §3 adapted scope; S3 rubric flow) — supertest
 * against the real Express `app` + live DynamoDB Local (localhost:8000, env in
 * jest.setup.ts). Drives a player across a login MILESTONE and asserts the
 * atomic award (Inv 4) end-to-end:
 *
 *   1. seed the player at login streak 6 with `lastLoginDate = yesterday` (and a
 *      matching activity row) → today's check-in advances to 7 ⇒ `milestoneEarned`
 *      is the 7-day login reward (150 pts) with the full notification, and
 *      `nextLoginMilestone` rolls to the 14-rung;
 *   2. simulate the NEXT day by re-seeding the player at streak 7 with
 *      `lastLoginDate = yesterday` again → check-in advances to 8 ⇒
 *      `milestoneEarned: null` (8 is not a rung);
 *   3. `GET …/rewards` returns exactly ONE reward — the 7-day one — newest-first,
 *      with the right points + notification.
 *
 * "Today" is real UTC today (the handler computes it from `nowIso()`); we cannot
 * move the wall clock, so we control the day RELATIVE to today by seeding the
 * player's `lastLoginDate` to today−1 via the repository + a raw docClient
 * write (test-only seed). A fresh player's `…/rewards` is also asserted to be
 * `[]`. Unique random playerId per run so reruns never collide.
 */
import request from 'supertest';
import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

import { app } from '../../handler';
import { docClient } from '../../shared/config/dynamo';
import { getPlayer } from '../../src/repositories/dynamo.repository';
import { nowIso, utcDay, yesterday as priorDay } from '../../src/lib/utc';
import type { PlayerStreak } from '../../src/domain/types';

const PLAYERS_TABLE = process.env.STREAKS_PLAYERS_TABLE ?? 'streaks-players';
const ACTIVITY_TABLE = process.env.STREAKS_ACTIVITY_TABLE ?? 'streaks-activity';

const PLAYER_ID = `test-s3-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const FRESH_ID = `test-s3-fresh-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const TODAY = utcDay(nowIso());
const YESTERDAY = priorDay(TODAY);

/**
 * Seed the player at a given login streak with `lastLoginDate = yesterday` and a
 * matching yesterday activity row, and clear any `today` activity row — so the
 * next check-in is a clean +1 advance "today". Raw docClient puts are a
 * test-only seed (Inv 6 is about app code, not test fixtures).
 */
async function seedAtStreak(playerId: string, loginStreak: number): Promise<void> {
  const player: PlayerStreak = {
    playerId,
    loginStreak,
    playStreak: 0,
    bestLoginStreak: loginStreak,
    bestPlayStreak: 0,
    lastLoginDate: YESTERDAY,
    lastPlayDate: null,
    freezesAvailable: 0,
    freezesUsedThisMonth: 0,
    lastFreezeGrantDate: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await docClient.send(new PutCommand({ TableName: PLAYERS_TABLE, Item: player }));
  await docClient.send(
    new PutCommand({
      TableName: ACTIVITY_TABLE,
      Item: {
        playerId,
        date: YESTERDAY,
        loggedIn: true,
        played: false,
        freezeUsed: false,
        streakBroken: false,
        loginStreakAtDay: loginStreak,
        playStreakAtDay: 0,
        timestamp: nowIso(),
      },
    }),
  );
  // Ensure no `today` activity row lingers from a prior phase of this test.
  await docClient.send(
    new DeleteCommand({ TableName: ACTIVITY_TABLE, Key: { playerId, date: TODAY } }),
  );
}

describe('integration — login milestone award flow (S3)', () => {
  it('fresh player GET …/rewards → 200 with []', async () => {
    const res = await request(app).get('/api/v1/player/streaks/rewards').set('X-Player-Id', FRESH_ID);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('check-in crossing 7 ⇒ milestoneEarned is the 7-day login reward + notification', async () => {
    await seedAtStreak(PLAYER_ID, 6);

    const res = await request(app)
      .post('/api/v1/player/streaks/check-in')
      .set('X-Player-Id', PLAYER_ID);

    expect(res.status).toBe(200);
    expect(res.body.streakAdvanced).toBe(true);
    expect(res.body.streaks.loginStreak).toBe(7);
    // next milestone rolls to the 14-rung
    expect(res.body.streaks.nextLoginMilestone).toEqual({ days: 14, reward: 400, daysRemaining: 7 });

    const earned = res.body.milestoneEarned;
    expect(earned).not.toBeNull();
    expect(earned).toMatchObject({
      type: 'login_milestone',
      milestone: 7,
      points: 150,
      streakCount: 7,
    });
    expect(typeof earned.rewardId).toBe('string');
    expect(earned.notification).toEqual({
      title: '7-day login streak!',
      body: 'You earned 150 bonus points for a 7-day login streak. 14 days unlocks 400!',
      deepLink: 'hijackpoker://streaks',
      milestone: 7,
      type: 'login_milestone',
    });

    // the player record actually advanced to 7 in the transaction
    const persisted = await getPlayer(PLAYER_ID);
    expect(persisted?.loginStreak).toBe(7);
    expect(persisted?.lastLoginDate).toBe(TODAY);
  });

  // SM-5(c) part 1: advancing PAST a crossed rung fires NO second award.
  it('SM-5(c) next-day advance to 8 ⇒ milestoneEarned: null (8 is not a rung)', async () => {
    // simulate the next day: player at 7, lastLoginDate=yesterday, today cleared.
    await seedAtStreak(PLAYER_ID, 7);

    const res = await request(app)
      .post('/api/v1/player/streaks/check-in')
      .set('X-Player-Id', PLAYER_ID);

    expect(res.status).toBe(200);
    expect(res.body.streakAdvanced).toBe(true);
    expect(res.body.streaks.loginStreak).toBe(8);
    expect(res.body.milestoneEarned).toBeNull();
  });

  // SM-5(c) part 2: across the whole instance the 7-rung reward exists EXACTLY
  // once (fires once per instance, never duplicated by the later advances).
  it('SM-5(c) GET …/rewards → exactly one reward (the 7-day) with right points + notification', async () => {
    const res = await request(app)
      .get('/api/v1/player/streaks/rewards')
      .set('X-Player-Id', PLAYER_ID);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    const reward = res.body[0];
    expect(reward).toMatchObject({
      type: 'login_milestone',
      milestone: 7,
      points: 150,
      streakCount: 7,
    });
    expect(reward.notification.body).toBe(
      'You earned 150 bonus points for a 7-day login streak. 14 days unlocks 400!',
    );
    // internal ledger field is NOT surfaced on the wire
    expect(reward.pointTxnType).toBeUndefined();
    expect(reward.playerId).toBeUndefined();
  });
});
