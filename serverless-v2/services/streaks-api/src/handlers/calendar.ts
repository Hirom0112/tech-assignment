/**
 * GET /api/v1/player/streaks/calendar?month=YYYY-MM (FR-5.3,
 * API_CONTRACT.md §4.3) — the per-day activity array for one UTC calendar month
 * (the 30-day heat map, FR-4.3).
 *
 * THIN handler (Inv 6): HTTP + validation only. It resolves/validates the
 * `month` param at the edge (default = current UTC month, malformed → 400 via
 * the typed `InvalidMonthError`), computes "today" ONCE (Inv 1), loads the
 * month's rows via the repository's `queryMonth` (a single `Query` with
 * `begins_with` — never a `Scan`, NFR-8/Inv 8), and hands them to the pure
 * calendar service to densify into the §4.3 `{month, days[]}` wire shape. No
 * `docClient` here, no day-math beyond the single edge computation.
 */
import type { Request, Response } from 'express';

import { queryMonth } from '../repositories/dynamo.repository';
import {
  buildMonthDays,
  resolveMonth,
  InvalidMonthError,
  type CalendarDay,
} from '../services/calendar.service';
import { utcDay, nowIso } from '../lib/utc';
import { BadRequestError, UnauthorizedError } from '../middleware/error';

/** The §4.3 calendar response body. */
interface CalendarResponse {
  month: string;
  days: CalendarDay[];
}

export async function getCalendarHandler(req: Request, res: Response): Promise<void> {
  const playerId = req.playerId;
  if (playerId === undefined) {
    throw new UnauthorizedError();
  }

  // Day-math computed once at the edge (Inv 1): today's UTC day drives the
  // current-month default and the future-day handling inside the service.
  const today = utcDay(nowIso());

  // `month` may be absent (→ current month) or malformed (→ 400). Read it as a
  // single string; an array (?month=a&month=b) is malformed.
  const rawMonth = req.query.month;
  const monthParam = typeof rawMonth === 'string' ? rawMonth : undefined;

  let month: string;
  try {
    month = resolveMonth(monthParam, today);
  } catch (err) {
    // A malformed month → 400 BadRequest (preserve the service's message).
    if (err instanceof InvalidMonthError) {
      throw new BadRequestError(err.message);
    }
    throw err;
  }

  // A DynamoDB failure rejects here → asyncHandler → 500 InternalError (A-3).
  const rows = await queryMonth(playerId, month);
  const body: CalendarResponse = { month, days: buildMonthDays(month, rows, today) };
  res.status(200).json(body);
}
