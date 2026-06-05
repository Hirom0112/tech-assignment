/**
 * GET /api/v1/player/streaks/share-card (FR-9.2, API_CONTRACT.md §4.9) — a
 * shareable, on-brand streak-card IMAGE for the authenticated player.
 *
 * THIN handler (Inv 6): HTTP only. It loads the player via the repository's
 * `getPlayer`, maps to the §4.1 aggregate via `toStreaksResponse`, and renders a
 * self-contained SVG via the zero-dep `renderShareCard` generator. No `docClient`
 * here. A never-seen player gets the zero-state aggregate (200, never 404) so the
 * dashboard "Share" never breaks for a new user (§4.9 ASSUMPTION).
 *
 * Content-Type is `image/svg+xml; charset=utf-8` — the ONE non-JSON success body
 * in the API (§1). Error bodies (e.g. 401, 400) remain JSON via the standard
 * error middleware.
 *
 * Degrade-never-500 (ARCHITECTURE §7): the card is a sharing nicety, not a data
 * source. If rendering itself fails for any reason, we serve the minimal branded
 * fallback SVG at 200 — never a 500. (A repository/DynamoDB read failure still
 * rejects to the error middleware as a 500, per A-3: that is a data-layer
 * failure, distinct from a render failure.)
 *
 * `?format` handling (§4.9): SVG is the guaranteed format and NO rasterizer is
 * built (TECH_STACK §1 — no satori/resvg). To keep the contract honest we reject
 * `format=png` (and any other non-`svg` value) with a `400 BadRequest` rather
 * than silently serving SVG under a PNG promise. `format=svg` or omitted → SVG.
 */
import type { Request, Response } from 'express';

import { getPlayer } from '../repositories/dynamo.repository';
import { toStreaksResponse, zeroStreaksResponse } from './presenter';
import { renderShareCard, fallbackCard } from '../lib/share-card';
import { BadRequestError, UnauthorizedError } from '../middleware/error';

/** The only accepted `format` value (SVG is the guaranteed, default format). */
const SVG_FORMAT = 'svg';

export async function shareCardHandler(req: Request, res: Response): Promise<void> {
  const playerId = req.playerId;
  if (playerId === undefined) {
    throw new UnauthorizedError();
  }

  // `format` query param (§4.9): default svg; png is not built (no rasterizer),
  // so png — and any other value — is an honest 400, not a silent SVG.
  const format = req.query.format;
  if (format !== undefined) {
    if (typeof format !== 'string' || format.toLowerCase() !== SVG_FORMAT) {
      throw new BadRequestError(
        "Query param 'format' must be 'svg'; png is not supported (svg only)",
      );
    }
  }

  // A repository / DynamoDB failure rejects here → asyncHandler → 500 (A-3).
  const player = await getPlayer(playerId);
  const aggregate = player === null ? zeroStreaksResponse() : toStreaksResponse(player);

  // Render is degrade-never-throw at the lib layer, but we also guard here so a
  // share-card response is ALWAYS a 200 image, never a 500 (ARCHITECTURE §7).
  let svg: string;
  try {
    svg = renderShareCard({
      loginStreak: aggregate.loginStreak,
      playStreak: aggregate.playStreak,
      bestLoginStreak: aggregate.bestLoginStreak,
    });
  } catch {
    svg = fallbackCard();
  }

  res.status(200).type('image/svg+xml; charset=utf-8').send(svg);
}
