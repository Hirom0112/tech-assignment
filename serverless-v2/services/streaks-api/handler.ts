import express, { type Request, type Response, type NextFunction } from 'express';
import serverless from 'serverless-http';

import healthRoute from './src/routes/health';
import { authMiddleware } from './src/middleware/auth';
import { internalAuthMiddleware } from './src/middleware/internalAuth';
import { correlationMiddleware } from './src/middleware/correlation';
import { asyncHandler } from './src/middleware/asyncHandler';
import { errorHandler, NotFoundError } from './src/middleware/error';
import { checkInHandler } from './src/handlers/check-in';
import { getStreaksHandler } from './src/handlers/streaks';
import { getRewardsHandler } from './src/handlers/rewards';
import { getFreezesHandler } from './src/handlers/freezes';
import { getCalendarHandler } from './src/handlers/calendar';
import { handCompletedHandler } from './src/handlers/internal';
import { grantFreezesHandler, getPlayerHistoryHandler } from './src/handlers/admin';

export const app = express();

app.use(express.json());

// Per-request correlationId (S7-2, NFR-6) — set before anything that logs.
app.use(correlationMiddleware);

// CORS for local frontend
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Player-Id');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Public routes
app.use('/api/v1/health', healthRoute);

// Player streak routes (FR-5.1/5.2) behind the stubbed player auth (Inv 10).
// Canonical Unity-contract path is `/api/v1/player/streaks…`; `/api/v1/streaks…`
// is kept as a backward-compatible alias routed to the same handlers (ADR-6).
// Async handlers are wrapped with `asyncHandler` so a rejected promise is
// forwarded to the error middleware (S7-1) rather than escaping as an
// unhandled rejection. `authMiddleware` throws synchronously and is forwarded
// by Express directly.
app.get('/api/v1/player/streaks', authMiddleware, asyncHandler(getStreaksHandler));
app.post('/api/v1/player/streaks/check-in', authMiddleware, asyncHandler(checkInHandler));
app.get('/api/v1/player/streaks/rewards', authMiddleware, asyncHandler(getRewardsHandler));
app.get('/api/v1/player/streaks/freezes', authMiddleware, asyncHandler(getFreezesHandler));
app.get('/api/v1/player/streaks/calendar', authMiddleware, asyncHandler(getCalendarHandler));
app.get('/api/v1/streaks', authMiddleware, asyncHandler(getStreaksHandler));
app.post('/api/v1/streaks/check-in', authMiddleware, asyncHandler(checkInHandler));
app.get('/api/v1/streaks/rewards', authMiddleware, asyncHandler(getRewardsHandler));
app.get('/api/v1/streaks/freezes', authMiddleware, asyncHandler(getFreezesHandler));
app.get('/api/v1/streaks/calendar', authMiddleware, asyncHandler(getCalendarHandler));

// Internal server-to-server route (FR-6) — guarded by the shared-secret
// `internalAuthMiddleware` ONLY (Inv 10, FR-6.3). Deliberately OUTSIDE the
// player-auth group: it never accepts `X-Player-Id`; the target player is in
// the body. Must never sit behind `authMiddleware`.
app.post('/internal/streaks/hand-completed', internalAuthMiddleware, asyncHandler(handCompletedHandler));

// Admin route (FR-3.3) — guarded by `internalAuthMiddleware` (X-Internal-Secret)
// ONLY (Inv 10). Never sits behind player auth; the target player is in the body
// (never `X-Player-Id`). A missing/invalid secret → 403 before the handler runs.
app.post('/api/v1/admin/streaks/freezes/grant', internalAuthMiddleware, asyncHandler(grantFreezesHandler));

// Admin view-history (FR-8, §4.8) — the composite player picture for support/
// debug. `internalAuthMiddleware` (X-Internal-Secret) ONLY (Inv 10); never
// player auth. The target player is the PATH param (never `X-Player-Id`); a
// missing/invalid secret → 403 BEFORE any lookup. Scan-free (Inv 8): it reuses
// the bounded player Query helpers.
app.get('/api/v1/admin/streaks/players/:playerId/history', internalAuthMiddleware, asyncHandler(getPlayerHistoryHandler));

// Unmatched route (S7-1, §3): forward a canonical `NotFoundError` so the error
// middleware emits `{error:'NotFound', message}` — NOT the old `{error:'Not
// found'}` non-canonical shape. Reached only AFTER route matching, so the
// auth-before-404 ordering (§2) holds: an unauthenticated request to a
// *player-prefixed* route still hits its `authMiddleware` (→ 401) before any
// 404; a totally unknown path matches no route and lands here as a 404.
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError(`No route for ${req.method} ${req.path}`));
});

// Error-normalizing middleware (S7-1) — MUST be registered last.
app.use(errorHandler);

export const api = serverless(app);
