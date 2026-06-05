/**
 * The single source of UTC calendar-day math (Inv 1, NFR-1).
 *
 * Every "day" in the streak engine is a UTC calendar day. All day-level math
 * flows through these helpers — no `new Date()` day arithmetic lives anywhere
 * else in the codebase. Backed by Luxon `DateTime.utc()`.
 */
import { DateTime } from 'luxon';

/**
 * Normalize an ISO instant (or date) to its UTC calendar date.
 * @example utcDay('2026-02-20T00:00:00Z') => '2026-02-20'
 */
export function utcDay(iso: string): string {
  return toIsoDate(DateTime.fromISO(iso, { zone: 'utc' }));
}

/**
 * The UTC date immediately before the given ISO date.
 * @example yesterday('2026-03-01') => '2026-02-28'
 */
export function yesterday(isoDate: string): string {
  return toIsoDate(DateTime.fromISO(isoDate, { zone: 'utc' }).minus({ days: 1 }));
}

/**
 * Integer count of whole UTC days from `a` to `b` (b − a).
 * @example daysBetween('2026-02-18', '2026-02-20') => 2
 */
export function daysBetween(a: string, b: string): number {
  const start = DateTime.fromISO(a, { zone: 'utc' }).startOf('day');
  const end = DateTime.fromISO(b, { zone: 'utc' }).startOf('day');
  return Math.round(end.diff(start, 'days').days);
}

/**
 * The `YYYY-MM` year-month for the given ISO date (used for monthly freeze grants).
 * @example yearMonth('2026-06-05') => '2026-06'
 */
export function yearMonth(isoDate: string): string {
  return DateTime.fromISO(isoDate, { zone: 'utc' }).toFormat('yyyy-MM');
}

/**
 * The current instant as an ISO-8601 UTC timestamp. The single source of
 * "now" so no other module calls `new Date()` (Inv 1).
 * @example nowIso() => '2026-06-05T09:14:02.117Z'
 */
export function nowIso(): string {
  return DateTime.utc().toISO() ?? '';
}

/**
 * True iff `value` is a syntactically AND calendar-valid UTC `YYYY-MM`
 * (`^\d{4}-\d{2}$`, month 01–12). The single source for calendar-month
 * validation so the handler never hand-rolls a regex (Inv 1).
 * @example isValidYearMonth('2026-02') => true
 * @example isValidYearMonth('2026-13') => false
 * @example isValidYearMonth('2026-2')  => false
 */
export function isValidYearMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }
  return DateTime.fromFormat(value, 'yyyy-MM', { zone: 'utc' }).isValid;
}

/**
 * The ascending list of every UTC `YYYY-MM-DD` calendar day in `yearMonth`
 * (`YYYY-MM`). The single source of "how many days in this month" so the dense
 * calendar array isn't hand-rolled (Inv 1, NFR-1). Throws on a malformed month.
 * @example monthDays('2026-02') => ['2026-02-01', …, '2026-02-28'] (28 entries)
 */
export function monthDays(yearMonth: string): string[] {
  const start = DateTime.fromFormat(yearMonth, 'yyyy-MM', { zone: 'utc' });
  if (!start.isValid) {
    throw new Error(`Invalid year-month: ${yearMonth}`);
  }
  const count = start.daysInMonth ?? 0;
  const days: string[] = [];
  for (let day = 0; day < count; day++) {
    days.push(toIsoDate(start.plus({ days: day })));
  }
  return days;
}

/**
 * The `YYYY-MM` of the given ISO date — distinct from `yearMonth(isoDate)` only
 * in intent (resolving the current month for the calendar default). Reuses the
 * same single-source month formatter.
 * @example monthOf('2026-06-05') => '2026-06'
 */
export function monthOf(isoDate: string): string {
  return yearMonth(isoDate);
}

/**
 * Epoch milliseconds for an ISO instant — the single place day/time math turns
 * an instant into a sortable integer (Inv 1). Used to build the time-ordered,
 * zero-padded `rewardId` prefix so a reward `Query` with `ScanIndexForward=false`
 * yields newest-first directly (ASSUMPTIONS A-7). Throws on an invalid instant.
 * @example epochMillis('2026-02-20T08:15:02.000Z') => 1771575302000
 */
export function epochMillis(iso: string): number {
  const ms = DateTime.fromISO(iso, { zone: 'utc' }).toMillis();
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid ISO instant: ${iso}`);
  }
  return ms;
}

/**
 * True iff `value` parses as a valid ISO-8601 instant/date (Luxon-validated).
 * The single place that decides "is this a usable ISO timestamp" so handlers
 * never hand-roll `new Date()` validation (Inv 1).
 * @example isIsoInstant('2026-02-20T14:30:00Z') => true
 * @example isIsoInstant('not-a-date') => false
 */
export function isIsoInstant(value: string): boolean {
  return DateTime.fromISO(value, { zone: 'utc' }).isValid;
}

function toIsoDate(dt: DateTime): string {
  const value = dt.toISODate();
  if (value === null) {
    throw new Error('Invalid ISO date');
  }
  return value;
}
