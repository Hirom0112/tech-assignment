/**
 * calendar.service unit tests (CLAUDE.md §3 strict scope — the "Calendar
 * derivation" worked target). PURE logic only: collapsing the activity booleans
 * into the §5 `activity` enum, assembling the dense one-per-day month array
 * (API_CONTRACT.md §4.3), and validating/defaulting the `month` query param.
 * No DynamoDB IO here.
 */
import {
  deriveActivity,
  buildMonthDays,
  resolveMonth,
  InvalidMonthError,
} from '../../src/services/calendar.service';
import type { ActivityDay } from '../../src/domain/types';

/** A complete activity row with all booleans false (override per test). */
function row(overrides: Partial<ActivityDay>): ActivityDay {
  return {
    playerId: 'p1',
    date: '2026-02-01',
    loggedIn: false,
    played: false,
    freezeUsed: false,
    streakBroken: false,
    loginStreakAtDay: 0,
    playStreakAtDay: 0,
    timestamp: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('calendar.service › deriveActivity (canonical priority, DATA_MODEL §3)', () => {
  it('no row → none', () => {
    expect(deriveActivity(undefined)).toBe('none');
  });

  it('{loggedIn:true, played:false} → login_only', () => {
    expect(deriveActivity(row({ loggedIn: true }))).toBe('login_only');
  });

  it('{played:true} → played', () => {
    expect(deriveActivity(row({ played: true }))).toBe('played');
  });

  it('{freezeUsed:true} → freeze', () => {
    expect(deriveActivity(row({ freezeUsed: true }))).toBe('freeze');
  });

  it('{streakBroken:true} → broken', () => {
    expect(deriveActivity(row({ streakBroken: true }))).toBe('broken');
  });

  it('all-false row → none', () => {
    expect(deriveActivity(row({}))).toBe('none');
  });

  // Priority: played > freeze > broken > login_only > none (order-independent).
  it('played outranks freeze, broken and login_only', () => {
    expect(
      deriveActivity(
        row({ played: true, freezeUsed: true, streakBroken: true, loggedIn: true }),
      ),
    ).toBe('played');
  });

  it('freeze outranks broken and login_only', () => {
    expect(
      deriveActivity(row({ freezeUsed: true, streakBroken: true, loggedIn: true })),
    ).toBe('freeze');
  });

  it('broken outranks login_only', () => {
    expect(deriveActivity(row({ streakBroken: true, loggedIn: true }))).toBe('broken');
  });

  it('login_only outranks none', () => {
    expect(deriveActivity(row({ loggedIn: true }))).toBe('login_only');
  });
});

describe('calendar.service › dense month array (API_CONTRACT §4.3)', () => {
  it('emits ONE entry per calendar day, ascending by date (Feb 2026 = 28 days)', () => {
    const days = buildMonthDays('2026-02', [], '2026-03-15');
    expect(days).toHaveLength(28);
    expect(days[0].date).toBe('2026-02-01');
    expect(days[27].date).toBe('2026-02-28');
    // strictly ascending
    for (let i = 1; i < days.length; i++) {
      expect(days[i].date > days[i - 1].date).toBe(true);
    }
  });

  it('absent days are none with zeroed counters', () => {
    const days = buildMonthDays('2026-02', [], '2026-03-15');
    expect(days[3]).toEqual({
      date: '2026-02-04',
      activity: 'none',
      loginStreak: 0,
      playStreak: 0,
    });
  });

  it('maps present rows to their derived activity + at-day counters', () => {
    const rows: ActivityDay[] = [
      row({ date: '2026-02-01', loggedIn: true, played: true, loginStreakAtDay: 8, playStreakAtDay: 3 }),
      row({ date: '2026-02-02', loggedIn: true, loginStreakAtDay: 9, playStreakAtDay: 0 }),
      row({ date: '2026-02-03', freezeUsed: true, loginStreakAtDay: 9, playStreakAtDay: 0 }),
      row({ date: '2026-02-05', streakBroken: true, loginStreakAtDay: 0, playStreakAtDay: 0 }),
    ];
    const days = buildMonthDays('2026-02', rows, '2026-03-15');
    expect(days[0]).toEqual({ date: '2026-02-01', activity: 'played', loginStreak: 8, playStreak: 3 });
    expect(days[1]).toEqual({ date: '2026-02-02', activity: 'login_only', loginStreak: 9, playStreak: 0 });
    expect(days[2]).toEqual({ date: '2026-02-03', activity: 'freeze', loginStreak: 9, playStreak: 0 });
    expect(days[3]).toEqual({ date: '2026-02-04', activity: 'none', loginStreak: 0, playStreak: 0 });
    expect(days[4]).toEqual({ date: '2026-02-05', activity: 'broken', loginStreak: 0, playStreak: 0 });
  });

  it('future days within the current month are none zeroed', () => {
    // today = 2026-06-05; days 06..30 are in the future for the current month.
    const rows: ActivityDay[] = [
      row({ date: '2026-06-05', loggedIn: true, loginStreakAtDay: 5, playStreakAtDay: 0 }),
    ];
    const days = buildMonthDays('2026-06', rows, '2026-06-05');
    expect(days).toHaveLength(30);
    expect(days[4]).toEqual({ date: '2026-06-05', activity: 'login_only', loginStreak: 5, playStreak: 0 });
    // 2026-06-06 onward are future → none zeroed even though no row exists.
    expect(days[5]).toEqual({ date: '2026-06-06', activity: 'none', loginStreak: 0, playStreak: 0 });
    expect(days[29]).toEqual({ date: '2026-06-30', activity: 'none', loginStreak: 0, playStreak: 0 });
  });
});

describe('calendar.service › resolveMonth (validation + default)', () => {
  it('accepts a well-formed YYYY-MM', () => {
    expect(resolveMonth('2026-02', '2026-06-05')).toBe('2026-02');
    expect(resolveMonth('2026-12', '2026-06-05')).toBe('2026-12');
    expect(resolveMonth('2026-01', '2026-06-05')).toBe('2026-01');
  });

  it('defaults to the current UTC month when omitted', () => {
    expect(resolveMonth(undefined, '2026-06-05')).toBe('2026-06');
  });

  it('rejects a single-digit month (2026-2) with InvalidMonthError', () => {
    expect(() => resolveMonth('2026-2', '2026-06-05')).toThrow(InvalidMonthError);
  });

  it('rejects month 13 (2026-13)', () => {
    expect(() => resolveMonth('2026-13', '2026-06-05')).toThrow(InvalidMonthError);
  });

  it('rejects month 00 (2026-00)', () => {
    expect(() => resolveMonth('2026-00', '2026-06-05')).toThrow(InvalidMonthError);
  });

  it('rejects a non-numeric month (feb)', () => {
    expect(() => resolveMonth('feb', '2026-06-05')).toThrow(InvalidMonthError);
  });
});
