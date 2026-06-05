/**
 * Pure-logic unit tests for the freeze service (CLAUDE.md §3 strict scope,
 * Inv 5, ARCHITECTURE §5c). `evaluateFreeze` is PURE: given the loaded player +
 * today's UTC date + the relevant `lastDate` (the axis's last active day), it
 * returns the lazy-eval DECISION — monthly grant, missed-day detection, freeze
 * consumption — WITHOUT doing any DynamoDB IO. The check-in / hand-completed
 * flow applies the decision (grant → consume → transition) before the streak
 * transition.
 *
 * Gap semantics (binding): gap = daysBetween(lastDate, today).
 *   gap===1 consecutive → normal advance; gap===2 exactly ONE missed day;
 *   gap>=3 TWO or more missed days (a single freeze can't cover both → reset).
 */
import { evaluateFreeze } from '../../src/services/freeze.service';
import type { PlayerStreak } from '../../src/domain/types';

const TODAY = '2026-06-05';

/** A fully-populated existing player record; override per test. */
function player(overrides: Partial<PlayerStreak>): PlayerStreak {
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

describe('freeze.service — evaluateFreeze', () => {
  // S4-1 / S4-2: missed one day, freeze available ⇒ consume, streak preserved.
  it('missed one day, freeze available ⇒ freeze consumed + streak protected', () => {
    // lastLoginDate = 2 days ago (gap 2), freezesAvailable = 1, loginStreak = 9.
    const p = player({
      loginStreak: 9,
      bestLoginStreak: 9,
      lastLoginDate: '2026-06-03', // 2 days before today (gap 2)
      freezesAvailable: 1,
      freezesUsedThisMonth: 0,
      lastFreezeGrantDate: '2026-06', // same month → no monthly grant noise
    });

    const d = evaluateFreeze(p, '2026-06-03', TODAY);

    expect(d.protected).toBe(true);
    expect(d.freezeConsumed).toBe(true);
    expect(d.missedDate).toBe('2026-06-04'); // the single missed day (yesterday)
    expect(d.freezeSource).toBe('purchased'); // no free_monthly available this month
    expect(d.newFreezesAvailable).toBe(0); // 1 - 1
    expect(d.newFreezesUsedThisMonth).toBe(1); // 0 + 1
    expect(d.grantedMonthly).toBe(false);
  });

  // SM-5(b): a multi-day gap with only 1 freeze still resets — the single
  // freeze covers the FIRST missed day, the streak resets on the SECOND.
  // S4-3 / S4-4: two missed days (gap>=3), one freeze ⇒ NO protection, reset.
  it('SM-5(b) missed two days, one freeze ⇒ NOT protected (single freeze cannot cover both)', () => {
    // lastLoginDate = 3 days ago → gap 3 = two missed days.
    const p = player({
      loginStreak: 9,
      bestLoginStreak: 9,
      lastLoginDate: '2026-06-02', // gap 3 (two missed days)
      freezesAvailable: 1,
      lastFreezeGrantDate: '2026-06',
    });

    const d = evaluateFreeze(p, '2026-06-02', TODAY);

    expect(d.protected).toBe(false);
    expect(d.freezeConsumed).toBe(false);
    expect(d.missedDate).toBeUndefined();
    expect(d.newFreezesAvailable).toBe(1); // untouched
    expect(d.newFreezesUsedThisMonth).toBe(0);
  });

  // gap===2 but no freeze ⇒ no protection.
  it('missed one day, NO freeze ⇒ NOT protected (reset)', () => {
    const p = player({
      loginStreak: 9,
      lastLoginDate: '2026-06-03', // gap 2
      freezesAvailable: 0,
      lastFreezeGrantDate: '2026-06',
    });

    const d = evaluateFreeze(p, '2026-06-03', TODAY);

    expect(d.protected).toBe(false);
    expect(d.freezeConsumed).toBe(false);
    expect(d.newFreezesAvailable).toBe(0);
  });

  // gap===1 consecutive ⇒ no consume.
  it('consecutive day (gap 1) ⇒ no freeze consumed, no missed day', () => {
    const p = player({
      loginStreak: 4,
      lastLoginDate: '2026-06-04', // yesterday → gap 1
      freezesAvailable: 2,
      lastFreezeGrantDate: '2026-06',
    });

    const d = evaluateFreeze(p, '2026-06-04', TODAY);

    expect(d.protected).toBe(false);
    expect(d.freezeConsumed).toBe(false);
    expect(d.newFreezesAvailable).toBe(2);
  });

  // S4-5 / S4-6: a consumed freeze prefers the free_monthly granted this turn.
  it('freeze covers both axes: source is free_monthly when the monthly grant lands the same turn', () => {
    // Prior-month grant + gap 2 + zero starting balance: the monthly grant lands
    // (balance → 1) THEN the consume spends it, so the consumed source is
    // free_monthly. One decision protects BOTH axes for the same missed day.
    const p = player({
      loginStreak: 9,
      lastLoginDate: '2026-05-30', // a prior date; the CALLER passes the axis lastDate
      freezesAvailable: 0,
      freezesUsedThisMonth: 0,
      lastFreezeGrantDate: '2026-05', // prior month → grant due
    });

    // Use a controlled gap-2 lastDate so this is "exactly one missed day".
    const d = evaluateFreeze(p, '2026-06-03', TODAY);

    expect(d.grantedMonthly).toBe(true);
    expect(d.protected).toBe(true);
    expect(d.freezeConsumed).toBe(true);
    expect(d.freezeSource).toBe('free_monthly');
    expect(d.missedDate).toBe('2026-06-04');
    // grant (+1) then consume (−1) nets to 0 available.
    expect(d.newFreezesAvailable).toBe(0);
    expect(d.newFreezesUsedThisMonth).toBe(1);
    expect(d.newLastFreezeGrantDate).toBe('2026-06');
  });

  // S4-7 / S4-8: monthly grant on a different YYYY-MM; same month → no grant.
  it('monthly grant: prior YYYY-MM ⇒ +1 freeze and lastFreezeGrantDate set to current month', () => {
    const p = player({
      loginStreak: 4,
      lastLoginDate: '2026-06-04', // gap 1 (consecutive) → no consume, isolate the grant
      freezesAvailable: 2,
      lastFreezeGrantDate: '2026-05', // prior month
    });

    const d = evaluateFreeze(p, '2026-06-04', TODAY);

    expect(d.grantedMonthly).toBe(true);
    expect(d.newFreezesAvailable).toBe(3); // 2 + 1
    expect(d.newLastFreezeGrantDate).toBe('2026-06');
    expect(d.freezeConsumed).toBe(false);
  });

  it('monthly grant: never granted (null) ⇒ +1 freeze, lastFreezeGrantDate set', () => {
    const p = player({
      loginStreak: 1,
      lastLoginDate: '2026-06-04', // gap 1
      freezesAvailable: 0,
      lastFreezeGrantDate: null,
    });

    const d = evaluateFreeze(p, '2026-06-04', TODAY);

    expect(d.grantedMonthly).toBe(true);
    expect(d.newFreezesAvailable).toBe(1);
    expect(d.newLastFreezeGrantDate).toBe('2026-06');
  });

  it('monthly grant: same YYYY-MM ⇒ no grant', () => {
    const p = player({
      loginStreak: 4,
      lastLoginDate: '2026-06-04',
      freezesAvailable: 2,
      lastFreezeGrantDate: '2026-06', // already granted this month
    });

    const d = evaluateFreeze(p, '2026-06-04', TODAY);

    expect(d.grantedMonthly).toBe(false);
    expect(d.newFreezesAvailable).toBe(2);
    expect(d.newLastFreezeGrantDate).toBe('2026-06');
  });

  // New player / no prior date ⇒ no gap to protect, but the monthly grant can
  // still land on the first-ever activity.
  it('null lastDate (new player) ⇒ no consume; monthly grant still applies', () => {
    const p = player({
      lastLoginDate: null,
      freezesAvailable: 0,
      lastFreezeGrantDate: null,
    });

    const d = evaluateFreeze(p, null, TODAY);

    expect(d.protected).toBe(false);
    expect(d.freezeConsumed).toBe(false);
    expect(d.grantedMonthly).toBe(true);
    expect(d.newFreezesAvailable).toBe(1);
  });
});
