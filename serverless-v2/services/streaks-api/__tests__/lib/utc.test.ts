import {
  utcDay,
  yesterday,
  daysBetween,
  yearMonth,
  isValidYearMonth,
  monthDays,
  monthOf,
} from '../../src/lib/utc';

describe('lib/utc — UTC calendar-day helpers (Inv 1)', () => {
  it('utcDay() returns the UTC ISO date string for an instant', () => {
    expect(utcDay('2026-02-20T00:00:00Z')).toBe('2026-02-20');
  });

  it('yesterday() returns the prior UTC date (crossing a month boundary)', () => {
    expect(yesterday('2026-03-01')).toBe('2026-02-28');
  });

  it('daysBetween() returns the integer day count b − a', () => {
    expect(daysBetween('2026-02-18', '2026-02-20')).toBe(2);
  });

  it('yearMonth() returns YYYY-MM for an ISO date', () => {
    expect(yearMonth('2026-06-05')).toBe('2026-06');
  });

  it('monthOf() returns YYYY-MM for an ISO date (current-month default source)', () => {
    expect(monthOf('2026-06-05')).toBe('2026-06');
  });
});

describe('lib/utc — calendar-month helpers (Inv 1, FR-5.3)', () => {
  it('isValidYearMonth() accepts a well-formed month', () => {
    expect(isValidYearMonth('2026-02')).toBe(true);
    expect(isValidYearMonth('2026-12')).toBe(true);
    expect(isValidYearMonth('2026-01')).toBe(true);
  });

  it('isValidYearMonth() rejects malformed / out-of-range months', () => {
    expect(isValidYearMonth('2026-2')).toBe(false);
    expect(isValidYearMonth('2026-13')).toBe(false);
    expect(isValidYearMonth('2026-00')).toBe(false);
    expect(isValidYearMonth('feb')).toBe(false);
    expect(isValidYearMonth('2026-06-05')).toBe(false);
  });

  it('monthDays() lists every day of a 28-day month ascending', () => {
    const days = monthDays('2026-02');
    expect(days).toHaveLength(28);
    expect(days[0]).toBe('2026-02-01');
    expect(days[27]).toBe('2026-02-28');
  });

  it('monthDays() handles a 31-day month and a leap February', () => {
    expect(monthDays('2026-01')).toHaveLength(31);
    expect(monthDays('2024-02')).toHaveLength(29); // leap year
  });

  it('monthDays() throws on a malformed month', () => {
    expect(() => monthDays('2026-13')).toThrow();
  });
});
