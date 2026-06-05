import { applyLoginCheckIn, nextLoginMilestone } from '../../src/services/streak.service';
import type { PlayerStreak } from '../../src/domain/types';

/**
 * Pure-logic unit tests for the login streak service (CLAUDE.md §3 strict
 * scope). The service takes the current player record + today's/yesterday's
 * UTC date strings (computed once at the edge) and returns the new state + the
 * activity row to write. It performs NO DynamoDB IO (Inv 6).
 */

const TODAY = '2026-06-05';
const YESTERDAY = '2026-06-04';

/** A fully-populated existing player record; override per test. */
function existingPlayer(overrides: Partial<PlayerStreak>): PlayerStreak {
  return {
    playerId: 'p1',
    loginStreak: 0,
    playStreak: 0,
    bestLoginStreak: 0,
    bestPlayStreak: 0,
    lastLoginDate: null,
    lastPlayDate: null,
    freezesAvailable: 0,
    freezesUsedThisMonth: 0,
    lastFreezeGrantDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('streak.service — applyLoginCheckIn', () => {
  it('first check-in (new player) → loginStreak=1, bestLoginStreak=1, activity logged', () => {
    const result = applyLoginCheckIn(null, 'p1', TODAY, YESTERDAY);

    expect(result.streakAdvanced).toBe(true);
    expect(result.player.loginStreak).toBe(1);
    expect(result.player.bestLoginStreak).toBe(1);
    expect(result.player.lastLoginDate).toBe(TODAY);
    expect(result.activity).not.toBeNull();
    expect(result.activity).toMatchObject({
      playerId: 'p1',
      date: TODAY,
      loggedIn: true,
      loginStreakAtDay: 1,
      streakBroken: false,
    });
  });

  it('consecutive day (lastLoginDate=yesterday, loginStreak=4) → loginStreak=5', () => {
    const player = existingPlayer({
      loginStreak: 4,
      bestLoginStreak: 4,
      lastLoginDate: YESTERDAY,
    });
    const result = applyLoginCheckIn(player, 'p1', TODAY, YESTERDAY);

    expect(result.streakAdvanced).toBe(true);
    expect(result.player.loginStreak).toBe(5);
    expect(result.player.bestLoginStreak).toBe(5);
    expect(result.activity?.loginStreakAtDay).toBe(5);
    expect(result.activity?.streakBroken).toBe(false);
  });

  it('idempotent same-day (lastLoginDate===today) → streakAdvanced=false, unchanged', () => {
    const player = existingPlayer({
      loginStreak: 5,
      bestLoginStreak: 5,
      lastLoginDate: TODAY,
    });
    const result = applyLoginCheckIn(player, 'p1', TODAY, YESTERDAY);

    expect(result.streakAdvanced).toBe(false);
    expect(result.player.loginStreak).toBe(5);
    expect(result.activity).toBeNull();
  });

  it('missed day, no freeze (gap=2, freezes=0, loginStreak=9) → reset to 1, streakBroken', () => {
    const player = existingPlayer({
      loginStreak: 9,
      bestLoginStreak: 9,
      lastLoginDate: '2026-06-03',
      freezesAvailable: 0,
    });
    const result = applyLoginCheckIn(player, 'p1', TODAY, YESTERDAY);

    expect(result.streakAdvanced).toBe(true);
    expect(result.player.loginStreak).toBe(1);
    expect(result.player.bestLoginStreak).toBe(9);
    expect(result.activity?.streakBroken).toBe(true);
    expect(result.activity?.loginStreakAtDay).toBe(1);
  });
});

describe('streak.service — nextLoginMilestone', () => {
  it('loginStreak=12 → { days:14, reward:400, daysRemaining:2 }', () => {
    expect(nextLoginMilestone(12)).toEqual({ days: 14, reward: 400, daysRemaining: 2 });
  });

  it('loginStreak=0 → { days:3, reward:50, daysRemaining:3 }', () => {
    expect(nextLoginMilestone(0)).toEqual({ days: 3, reward: 50, daysRemaining: 3 });
  });

  it('loginStreak>=90 → null', () => {
    expect(nextLoginMilestone(90)).toBeNull();
    expect(nextLoginMilestone(120)).toBeNull();
  });
});
