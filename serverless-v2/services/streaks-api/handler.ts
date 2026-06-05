import express, { type Request, type Response, type NextFunction } from 'express';
import serverless from 'serverless-http';

import healthRoute from './src/routes/health';
import { authMiddleware } from './src/middleware/auth';
import { checkInHandler } from './src/handlers/check-in';
import { getStreaksHandler } from './src/handlers/streaks';

export const app = express();

app.use(express.json());

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
app.get('/api/v1/player/streaks', authMiddleware, getStreaksHandler);
app.post('/api/v1/player/streaks/check-in', authMiddleware, checkInHandler);
app.get('/api/v1/streaks', authMiddleware, getStreaksHandler);
app.post('/api/v1/streaks/check-in', authMiddleware, checkInHandler);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

export const api = serverless(app);
