/**
 * Calendar domain logic (CLAUDE.md §3 strict scope — the "Calendar derivation"
 * worked target, FR-5.3, API_CONTRACT.md §4.3). PURE: no DynamoDB IO.
 *
 * Three responsibilities, each a total function:
 *  1. `deriveActivity` — collapse an activity row's booleans into the §5
 *     `activity` enum, by the canonical DATA_MODEL §3 priority
 *     (`played > freeze > broken > login_only > none`); order-independent.
 *  2. `buildMonthDays` — assemble the dense one-entry-per-calendar-day array for
 *     a month, ascending by date; absent days and future days (in the current
 *     month) become `none` with zeroed counters.
 *  3. `resolveMonth` — validate the `month` query param (`^\d{4}-\d{2}$`, 01–12)
 *     or default to the current UTC month when omitted.
 *
 * The handler decides HTTP; the repository's `queryMonth` fetches the rows
 * (one `Query`, `begins_with`, never a `Scan` — Inv 8). This service is the only
 * place the calendar wire shape is computed.
 */
import { isValidYearMonth, monthDays, monthOf } from '../lib/utc';
import type { ActivityDay } from '../domain/types';

/** The §5.1 calendar-day activity enum (heat-map state). */
export type Activity = 'none' | 'login_only' | 'played' | 'freeze' | 'broken';

/** One element of the §4.3 calendar `days[]` array (the wire shape). */
export interface CalendarDay {
  date: string;
  activity: Activity;
  loginStreak: number;
  playStreak: number;
}

/**
 * Collapse one activity row's booleans into the §5 `activity` enum. TOTAL and
 * order-independent: the canonical DATA_MODEL §3 priority is evaluated
 * top-to-bottom, first match wins —
 * `played > freeze > broken > login_only > none`. A missing row (`undefined`)
 * is `none` (the calendar synthesizes a `none` day for any date with no row).
 */
export function deriveActivity(row: ActivityDay | undefined): Activity {
  if (row === undefined) {
    return 'none';
  }
  if (row.played) {
    return 'played';
  }
  if (row.freezeUsed) {
    return 'freeze';
  }
  if (row.streakBroken) {
    return 'broken';
  }
  if (row.loggedIn) {
    return 'login_only';
  }
  return 'none';
}

/**
 * Assemble the dense, ascending-by-date `days[]` array for `yearMonth`
 * (`YYYY-MM`) from the month's activity `rows` (in any order) and `today`
 * (`YYYY-MM-DD`, the request's UTC day). One entry per calendar day of the
 * month; a day with no row — including a future day in the current month — is
 * emitted as `none` with zeroed counters. Future-day handling falls out for
 * free: future days never have rows, so they map to `none`/0 like any absent
 * day (no special-casing needed beyond not inventing data for them).
 */
export function buildMonthDays(
  yearMonth: string,
  rows: ActivityDay[],
  _today: string,
): CalendarDay[] {
  const byDate = new Map<string, ActivityDay>();
  for (const row of rows) {
    byDate.set(row.date, row);
  }
  return monthDays(yearMonth).map((date) => {
    const row = byDate.get(date);
    return {
      date,
      activity: deriveActivity(row),
      loginStreak: row?.loginStreakAtDay ?? 0,
      playStreak: row?.playStreakAtDay ?? 0,
    };
  });
}

/**
 * Thrown when the `month` query param is malformed (not `^\d{4}-\d{2}$` or month
 * outside 01–12). The handler maps this to HTTP `400` (API_CONTRACT.md §4.3).
 * An OMITTED month is NOT an error — it defaults to the current UTC month.
 */
export class InvalidMonthError extends Error {
  constructor(month: string) {
    super(`Invalid month "${month}": expected YYYY-MM with month 01–12`);
    this.name = 'InvalidMonthError';
  }
}

/**
 * Resolve the calendar's target month. `month` omitted (`undefined`) → the
 * current UTC month derived from `today` (convenience for the dashboard's
 * initial load, ASSUMPTION). A present-but-malformed `month` (`2026-2`,
 * `2026-13`, `feb`) throws `InvalidMonthError` → 400.
 */
export function resolveMonth(month: string | undefined, today: string): string {
  if (month === undefined) {
    return monthOf(today);
  }
  if (!isValidYearMonth(month)) {
    throw new InvalidMonthError(month);
  }
  return month;
}
