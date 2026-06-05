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
