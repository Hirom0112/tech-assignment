import express, { type Request, type Response, type NextFunction } from 'express';
import serverless from 'serverless-http';

import healthRoute from './src/routes/health';

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

// S1 adds player streak routes (check-in, streaks, leaderboard) behind authMiddleware.

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

export const api = serverless(app);
