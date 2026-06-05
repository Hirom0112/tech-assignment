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
} from '../../src/repositories/dynamo.repository';
import type { ActivityDay, PlayerStreak } from '../../src/domain/types';

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
