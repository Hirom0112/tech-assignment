/**
 * Repository unit tests with a MOCKED DocumentClient (CLAUDE.md §3 strict
 * scope). We assert on the COMMAND shapes the repository sends — the
 * conditional-write expressions are the load-bearing idempotency/safety
 * primitives (Inv 2, Inv 3, DATA_MODEL.md §7–8). No real DynamoDB here.
 */

// Mock the shared DocumentClient so we can capture every `send`.
const send = jest.fn();
jest.mock('../../shared/config/dynamo', () => ({
  docClient: { send: (...args: unknown[]) => send(...args) },
  ddbClient: {},
}));

import {
  getPlayer,
  createPlayer,
  putActivity,
  advanceLoginStreak,
  mergePlayed,
  advancePlayStreak,
  resetPlayStreak,
  awardMilestone,
  queryRewards,
} from '../../src/repositories/dynamo.repository';
import type { ActivityDay, PlayerStreak, RewardRecord } from '../../src/domain/types';

function samplePlayer(): PlayerStreak {
  return {
    playerId: 'p1',
    loginStreak: 1,
    playStreak: 0,
    bestLoginStreak: 1,
    bestPlayStreak: 0,
    lastLoginDate: '2026-06-05',
    lastPlayDate: null,
    freezesAvailable: 0,
    freezesUsedThisMonth: 0,
    lastFreezeGrantDate: null,
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  };
}

function sampleActivity(): ActivityDay {
  return {
    playerId: 'p1',
    date: '2026-06-05',
    loggedIn: true,
    played: false,
    freezeUsed: false,
    streakBroken: false,
    loginStreakAtDay: 1,
    playStreakAtDay: 0,
    timestamp: '2026-06-05T00:00:00.000Z',
  };
}

/** Pull the command input object from the most recent `send` call. */
function lastInput(): Record<string, unknown> {
  const cmd = send.mock.calls[send.mock.calls.length - 1][0] as { input: Record<string, unknown> };
  return cmd.input;
}

beforeEach(() => {
  send.mockReset();
});

describe('dynamo.repository', () => {
  it('getPlayer returns null when the item is absent', async () => {
    send.mockResolvedValueOnce({ Item: undefined });
    const result = await getPlayer('p1');
    expect(result).toBeNull();
    expect(lastInput()).toMatchObject({ Key: { playerId: 'p1' } });
  });

  it('getPlayer returns the item when present', async () => {
    send.mockResolvedValueOnce({ Item: samplePlayer() });
    const result = await getPlayer('p1');
    expect(result).toMatchObject({ playerId: 'p1', loginStreak: 1 });
  });

  it('createPlayer uses attribute_not_exists(playerId) condition', async () => {
    send.mockResolvedValueOnce({});
    await createPlayer(samplePlayer());
    const input = lastInput();
    expect(input.ConditionExpression).toContain('attribute_not_exists(playerId)');
    expect(input.Item).toMatchObject({ playerId: 'p1' });
  });

  it('putActivity uses attribute_not_exists(#date) with #date alias', async () => {
    send.mockResolvedValueOnce({});
    const ok = await putActivity(sampleActivity());
    const input = lastInput();
    expect(input.ConditionExpression).toContain('attribute_not_exists(#date)');
    expect(input.ExpressionAttributeNames).toMatchObject({ '#date': 'date' });
    expect(ok).toBe(true);
  });

  it('putActivity returns false on ConditionalCheckFailedException (same-day repeat)', async () => {
    send.mockRejectedValueOnce(
      Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' }),
    );
    const ok = await putActivity(sampleActivity());
    expect(ok).toBe(false);
  });

  it('advanceLoginStreak conditions on lastLoginDate = :yesterday and SETs loginStreak = :n (no ADD)', async () => {
    send.mockResolvedValueOnce({});
    await advanceLoginStreak({
      playerId: 'p1',
      loginStreak: 5,
      bestLoginStreak: 5,
      today: '2026-06-05',
      yesterday: '2026-06-04',
      now: '2026-06-05T00:00:00.000Z',
    });
    const input = lastInput();
    expect(input.ConditionExpression).toContain('lastLoginDate = :yesterday');
    expect(input.UpdateExpression).toContain('loginStreak = :n');
    expect(input.UpdateExpression).not.toMatch(/\bADD\b/);
    expect(input.ExpressionAttributeValues).toMatchObject({
      ':n': 5,
      ':yesterday': '2026-06-04',
      ':today': '2026-06-05',
    });
  });
});

describe('dynamo.repository — play writes (pattern E + conditional advance)', () => {
  it('mergePlayed UpdateCommand sets played=true + playStreakAtDay with create-or-merge condition + aliases', async () => {
    send.mockResolvedValueOnce({});
    const ok = await mergePlayed({
      playerId: 'p1',
      date: '2026-02-20',
      playStreakAtDay: 3,
      loginStreakAtDay: 0,
      loggedIn: false,
      streakBroken: false,
      now: '2026-02-20T14:30:00.000Z',
    });
    const input = lastInput();
    expect(input.Key).toMatchObject({ playerId: 'p1', date: '2026-02-20' });
    // pattern E: create-or-merge — only the first hand of the day passes.
    expect(input.ConditionExpression).toContain('attribute_not_exists(#date)');
    expect(input.ConditionExpression).toContain('#played <> :true');
    expect(input.ExpressionAttributeNames).toMatchObject({ '#date': 'date', '#played': 'played' });
    expect(input.UpdateExpression).toContain('#played = :true');
    expect(input.UpdateExpression).toContain('playStreakAtDay = :psad');
    expect(input.UpdateExpression).not.toMatch(/\bADD\b/);
    expect(input.ExpressionAttributeValues).toMatchObject({ ':true': true, ':psad': 3 });
    expect(ok).toBe(true);
  });

  it('mergePlayed returns false on ConditionalCheckFailedException (same-day repeat hand)', async () => {
    send.mockRejectedValueOnce(
      Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' }),
    );
    const ok = await mergePlayed({
      playerId: 'p1',
      date: '2026-02-20',
      playStreakAtDay: 3,
      loginStreakAtDay: 0,
      loggedIn: false,
      streakBroken: false,
      now: '2026-02-20T14:30:00.000Z',
    });
    expect(ok).toBe(false);
  });

  it('advancePlayStreak conditions on lastPlayDate = :yesterday and SETs playStreak = :n (no ADD)', async () => {
    send.mockResolvedValueOnce({});
    await advancePlayStreak({
      playerId: 'p1',
      playStreak: 3,
      bestPlayStreak: 3,
      day: '2026-02-20',
      yesterday: '2026-02-19',
      now: '2026-02-20T14:30:00.000Z',
    });
    const input = lastInput();
    expect(input.ConditionExpression).toContain('lastPlayDate = :yesterday');
    expect(input.UpdateExpression).toContain('playStreak = :n');
    expect(input.UpdateExpression).not.toMatch(/\bADD\b/);
    expect(input.ExpressionAttributeValues).toMatchObject({
      ':n': 3,
      ':yesterday': '2026-02-19',
      ':day': '2026-02-20',
    });
  });

  it('resetPlayStreak SETs playStreak = :n guarded by lastPlayDate <> :day (no ADD)', async () => {
    send.mockResolvedValueOnce({});
    await resetPlayStreak({
      playerId: 'p1',
      playStreak: 1,
      bestPlayStreak: 5,
      day: '2026-02-20',
      now: '2026-02-20T14:30:00.000Z',
    });
    const input = lastInput();
    expect(input.ConditionExpression).toContain('lastPlayDate <> :day');
    expect(input.UpdateExpression).toContain('playStreak = :n');
    expect(input.UpdateExpression).not.toMatch(/\bADD\b/);
    expect(input.ExpressionAttributeValues).toMatchObject({ ':n': 1, ':day': '2026-02-20' });
  });
});

function sampleReward(): RewardRecord {
  return {
    rewardId: '001771575302000-abc12345',
    type: 'login_milestone',
    milestone: 7,
    points: 150,
    streakCount: 7,
    createdAt: '2026-02-13T08:03:55.000Z',
    notification: {
      title: '7-day login streak!',
      body: 'You earned 150 bonus points for a 7-day login streak. 14 days unlocks 400!',
      deepLink: 'hijackpoker://streaks',
      milestone: 7,
      type: 'login_milestone',
    },
  };
}

describe('dynamo.repository — awardMilestone transaction (Inv 4)', () => {
  it('bundles exactly 3 writes into ONE TransactWriteCommand: player Update + activity Put + reward Put', async () => {
    send.mockResolvedValueOnce({});
    const ok = await awardMilestone({
      player: {
        playerId: 'p1',
        loginStreak: 7,
        bestLoginStreak: 7,
        date: '2026-02-13',
        yesterday: '2026-02-12',
        axis: 'login',
        isNewPlayer: false,
      },
      activity: sampleActivity(),
      reward: sampleReward(),
      now: '2026-02-13T08:03:55.000Z',
    });

    const input = lastInput() as { TransactItems: Array<Record<string, Record<string, unknown>>> };
    // ONE TransactWriteCommand with exactly three items.
    expect(Array.isArray(input.TransactItems)).toBe(true);
    expect(input.TransactItems).toHaveLength(3);

    const update = input.TransactItems.find((i) => i.Update)?.Update;
    const puts = input.TransactItems.filter((i) => i.Put).map((i) => i.Put);
    expect(update).toBeDefined();
    expect(puts).toHaveLength(2);

    // (1) player Update — conditional advance (SET, condition on yesterday; no bare ADD).
    expect(update?.TableName).toBe('streaks-players');
    expect(update?.Key).toMatchObject({ playerId: 'p1' });
    expect(update?.UpdateExpression).toContain('loginStreak = :n');
    expect(update?.UpdateExpression).not.toMatch(/\bADD\b/);
    expect(update?.ConditionExpression).toContain('lastLoginDate = :yesterday');
    expect(update?.ExpressionAttributeValues).toMatchObject({ ':n': 7, ':yesterday': '2026-02-12' });

    // (2) activity Put — the once-per-day idempotency row.
    const activityPut = puts.find((p) => p?.TableName === 'streaks-activity');
    expect(activityPut).toBeDefined();
    expect(activityPut?.ConditionExpression).toContain('attribute_not_exists(#date)');
    expect(activityPut?.Item).toMatchObject({ playerId: 'p1', date: '2026-06-05' });

    // (3) reward Put — §4.4 fields + pointTxnType:'streak_bonus' + notification Map,
    //     guarded by attribute_not_exists(rewardId) (Inv 4 dup-write guard).
    const rewardPut = puts.find((p) => p?.TableName === 'streaks-rewards');
    expect(rewardPut).toBeDefined();
    expect(rewardPut?.ConditionExpression).toContain('attribute_not_exists(rewardId)');
    expect(rewardPut?.Item).toMatchObject({
      playerId: 'p1',
      rewardId: '001771575302000-abc12345',
      type: 'login_milestone',
      milestone: 7,
      points: 150,
      streakCount: 7,
      createdAt: '2026-02-13T08:03:55.000Z',
      pointTxnType: 'streak_bonus',
    });
    expect((rewardPut?.Item as { notification: unknown }).notification).toMatchObject({
      title: '7-day login streak!',
      deepLink: 'hijackpoker://streaks',
      milestone: 7,
      type: 'login_milestone',
    });
    expect(ok).toBe(true);
  });

  it('new-player milestone Update uses attribute_not_exists(playerId), not the yesterday condition', async () => {
    send.mockResolvedValueOnce({});
    await awardMilestone({
      player: {
        playerId: 'p2',
        loginStreak: 3,
        bestLoginStreak: 3,
        date: '2026-02-13',
        yesterday: '2026-02-12',
        axis: 'login',
        isNewPlayer: true,
      },
      activity: { ...sampleActivity(), playerId: 'p2' },
      reward: { ...sampleReward(), milestone: 3, points: 50, streakCount: 3 },
      now: '2026-02-13T08:03:55.000Z',
    });
    const input = lastInput() as { TransactItems: Array<Record<string, Record<string, unknown>>> };
    const update = input.TransactItems.find((i) => i.Update)?.Update;
    expect(update?.ConditionExpression).toContain('attribute_not_exists(playerId)');
    expect(update?.UpdateExpression).not.toMatch(/\bADD\b/);
  });

  it('play-axis milestone Update touches only playStreak with lastPlayDate condition', async () => {
    send.mockResolvedValueOnce({});
    await awardMilestone({
      player: {
        playerId: 'p3',
        playStreak: 7,
        bestPlayStreak: 7,
        date: '2026-02-13',
        yesterday: '2026-02-12',
        axis: 'play',
        isNewPlayer: false,
      },
      activity: { ...sampleActivity(), playerId: 'p3', played: true },
      reward: { ...sampleReward(), type: 'play_milestone', points: 300 },
      now: '2026-02-13T08:03:55.000Z',
    });
    const input = lastInput() as { TransactItems: Array<Record<string, Record<string, unknown>>> };
    const update = input.TransactItems.find((i) => i.Update)?.Update;
    expect(update?.UpdateExpression).toContain('playStreak = :n');
    expect(update?.UpdateExpression).not.toContain('loginStreak');
    expect(update?.ConditionExpression).toContain('lastPlayDate = :yesterday');
  });
});

describe('dynamo.repository — queryRewards (pattern H, NFR-8 no Scan)', () => {
  it('issues a Query (not a Scan) keyed on playerId with ScanIndexForward=false', async () => {
    send.mockResolvedValueOnce({ Items: [sampleReward()] });
    const rewards = await queryRewards('p1');
    const input = lastInput();
    expect(input.TableName).toBe('streaks-rewards');
    expect(input.KeyConditionExpression).toContain('playerId = :p');
    expect(input.ScanIndexForward).toBe(false);
    expect(input.ExpressionAttributeValues).toMatchObject({ ':p': 'p1' });
    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toMatchObject({ rewardId: '001771575302000-abc12345', points: 150 });
  });

  it('returns [] when the player has no rewards', async () => {
    send.mockResolvedValueOnce({ Items: undefined });
    expect(await queryRewards('nobody')).toEqual([]);
  });
});
