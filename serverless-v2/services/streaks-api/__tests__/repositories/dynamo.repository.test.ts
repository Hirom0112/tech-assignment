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
  consumeFreeze,
  grantFreezeAdmin,
  queryFreezeHistory,
  queryMonth,
} from '../../src/repositories/dynamo.repository';
import type {
  ActivityDay,
  FreezeRecord,
  PlayerStreak,
  RewardRecord,
} from '../../src/domain/types';

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

function sampleFreezeRecord(): FreezeRecord {
  return {
    playerId: 'p1',
    date: '2026-06-04',
    source: 'purchased',
    createdAt: '2026-06-05T01:00:00.000Z',
  };
}

describe('dynamo.repository — consumeFreeze transaction (Inv 5, DATA_MODEL §8)', () => {
  it('bundles player Update + freeze-history Put + activity write into ONE TransactWriteCommand', async () => {
    send.mockResolvedValueOnce({});
    const ok = await consumeFreeze({
      playerId: 'p1',
      missedDate: '2026-06-04',
      source: 'purchased',
      newFreezesAvailable: 0,
      newFreezesUsedThisMonth: 1,
      now: '2026-06-05T09:00:00.000Z',
    });
    expect(ok).toBe(true);

    const input = lastInput() as { TransactItems: Array<Record<string, Record<string, unknown>>> };
    expect(Array.isArray(input.TransactItems)).toBe(true);
    expect(input.TransactItems).toHaveLength(3);

    const update = input.TransactItems.find((i) => i.Update && i.Update.TableName === 'streaks-players')?.Update;
    const historyPut = input.TransactItems.find((i) => i.Put && i.Put.TableName === 'streaks-freeze-history')?.Put;
    const activityWrite =
      input.TransactItems.find(
        (i) => (i.Update && i.Update.TableName === 'streaks-activity') || (i.Put && i.Put.TableName === 'streaks-activity'),
      ) ?? null;

    // (1) player Update — SET the computed balances (no bare ADD on streak
    // counters; freeze-balance ADD would be fine but we use SET to computed
    // values), guarded by freezesAvailable > :zero.
    expect(update).toBeDefined();
    expect(update?.Key).toMatchObject({ playerId: 'p1' });
    expect(update?.ConditionExpression).toContain('freezesAvailable > :zero');
    expect(update?.UpdateExpression).not.toMatch(/\bADD\b.*loginStreak/);
    expect(update?.UpdateExpression).not.toMatch(/\bADD\b.*playStreak/);
    expect(update?.ExpressionAttributeValues).toMatchObject({
      ':avail': 0,
      ':used': 1,
      ':zero': 0,
    });

    // (2) freeze-history Put — idempotent per missed day.
    expect(historyPut).toBeDefined();
    expect(historyPut?.ConditionExpression).toContain('attribute_not_exists(#date)');
    expect(historyPut?.Item).toMatchObject({ playerId: 'p1', date: '2026-06-04', source: 'purchased' });

    // (3) activity write — flips freezeUsed=true for the missed day.
    expect(activityWrite).not.toBeNull();
  });

  it('returns false when the transaction is cancelled by a condition (no balance)', async () => {
    send.mockRejectedValueOnce({ name: 'TransactionCanceledException' });
    const ok = await consumeFreeze({
      playerId: 'p1',
      missedDate: '2026-06-04',
      source: 'purchased',
      newFreezesAvailable: 0,
      newFreezesUsedThisMonth: 1,
      now: '2026-06-05T09:00:00.000Z',
    });
    expect(ok).toBe(false);
  });

  it('never uses a bare ADD on a streak counter in the consume transaction', async () => {
    send.mockResolvedValueOnce({});
    await consumeFreeze({
      playerId: 'p1',
      missedDate: '2026-06-04',
      source: 'free_monthly',
      newFreezesAvailable: 2,
      newFreezesUsedThisMonth: 1,
      now: '2026-06-05T09:00:00.000Z',
    });
    const input = lastInput() as { TransactItems: Array<Record<string, Record<string, unknown>>> };
    for (const item of input.TransactItems) {
      const expr = (item.Update?.UpdateExpression ?? '') as string;
      expect(expr).not.toMatch(/ADD\s+loginStreak/);
      expect(expr).not.toMatch(/ADD\s+playStreak/);
    }
  });
});

describe('dynamo.repository — grantFreezeAdmin (pattern J, cap 99)', () => {
  it('uses a single UpdateCommand with ADD freezesAvailable :n and the <=99 cap condition', async () => {
    send.mockResolvedValueOnce({ Attributes: { freezesAvailable: 5, updatedAt: '2026-06-05T09:00:00.000Z' } });
    const result = await grantFreezeAdmin({ playerId: 'p1', count: 3, now: '2026-06-05T09:00:00.000Z' });

    const input = lastInput();
    expect(input.TableName).toBe('streaks-players');
    expect(input.Key).toMatchObject({ playerId: 'p1' });
    // ADD on the freeze BALANCE is explicitly allowed (pattern J).
    expect(input.UpdateExpression).toContain('ADD freezesAvailable :n');
    // cap: only succeeds when absent OR current balance <= 99 - count.
    expect(input.ConditionExpression).toContain('attribute_not_exists(freezesAvailable)');
    expect(input.ConditionExpression).toContain('freezesAvailable <= :capMinusN');
    expect(input.ExpressionAttributeValues).toMatchObject({ ':n': 3, ':capMinusN': 96 });
    expect(input.ReturnValues).toBe('ALL_NEW');
    // returns the new balance from the Update's Attributes.
    expect(result.freezesAvailable).toBe(5);
  });

  it('propagates a ConditionalCheckFailedException so the handler can map it to 409', async () => {
    send.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });
    await expect(
      grantFreezeAdmin({ playerId: 'p1', count: 50, now: '2026-06-05T09:00:00.000Z' }),
    ).rejects.toMatchObject({ name: 'ConditionalCheckFailedException' });
  });
});

describe('dynamo.repository — queryMonth (pattern F, NFR-8 no Scan)', () => {
  // SM-5(d): a calendar month is served by a SINGLE Query — exactly one `send`,
  // and the command is a `QueryCommand`, never a `ScanCommand` (Inv 8, NFR-8).
  it('SM-5(d) issues ONE QueryCommand with begins_with(#date, :ym) + #date alias (no Scan)', async () => {
    send.mockResolvedValueOnce({ Items: [sampleActivity()] });
    const rows = await queryMonth('streak-001', '2026-06');
    expect(send).toHaveBeenCalledTimes(1);

    // The single command must be a Query, not a Scan.
    const cmd = send.mock.calls[0][0] as { constructor: { name: string } };
    expect(cmd.constructor.name).toBe('QueryCommand');
    expect(cmd.constructor.name).not.toBe('ScanCommand');

    const input = lastInput();
    expect(input.TableName).toBe('streaks-activity');
    // begins_with on the SK (#date) keyed on the PK — a single bounded Query.
    expect(input.KeyConditionExpression).toContain('playerId = :p');
    expect(input.KeyConditionExpression).toContain('begins_with(#date, :ym)');
    // `date` is a DynamoDB reserved word → must be aliased.
    expect(input.ExpressionAttributeNames).toMatchObject({ '#date': 'date' });
    expect(input.ExpressionAttributeValues).toMatchObject({ ':p': 'streak-001', ':ym': '2026-06' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ playerId: 'p1', date: '2026-06-05' });
  });

  it('returns [] when the month has no activity rows', async () => {
    send.mockResolvedValueOnce({ Items: undefined });
    expect(await queryMonth('nobody', '2026-06')).toEqual([]);
  });
});

describe('dynamo.repository — queryFreezeHistory (pattern I, NFR-8 no Scan)', () => {
  it('issues a Query (not a Scan) keyed on playerId with ScanIndexForward=false', async () => {
    send.mockResolvedValueOnce({ Items: [sampleFreezeRecord()] });
    const history = await queryFreezeHistory('p1');
    const input = lastInput();
    expect(input.TableName).toBe('streaks-freeze-history');
    expect(input.KeyConditionExpression).toContain('playerId = :p');
    expect(input.ScanIndexForward).toBe(false);
    expect(input.ExpressionAttributeValues).toMatchObject({ ':p': 'p1' });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ date: '2026-06-04', source: 'purchased' });
  });

  it('returns [] when the player has no freeze history', async () => {
    send.mockResolvedValueOnce({ Items: undefined });
    expect(await queryFreezeHistory('nobody')).toEqual([]);
  });
});
