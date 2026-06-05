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
import { logger } from '../../shared/config/logger';

/** The §4.3 calendar response body. */
interface CalendarResponse {
  month: string;
  days: CalendarDay[];
}

export async function getCalendarHandler(req: Request, res: Response): Promise<void> {
  const playerId = req.playerId;
  if (playerId === undefined) {
    res.status(401).json({ error: 'Unauthorized', message: 'X-Player-Id header is required' });
    return;
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
    if (err instanceof InvalidMonthError) {
      res.status(400).json({ error: 'BadRequest', message: err.message });
      return;
    }
    throw err;
  }

  try {
    const rows = await queryMonth(playerId, month);
    const body: CalendarResponse = { month, days: buildMonthDays(month, rows, today) };
    res.status(200).json(body);
  } catch (err) {
    logger.error('getCalendar failed', { playerId, month, err });
    res.status(500).json({ error: 'InternalError', message: 'Failed to load calendar' });
  }
}
