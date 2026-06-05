import { Router, type Request, type Response } from 'express';

const router = Router();

/**
 * GET /api/v1/health — liveness probe.
 * Returns service identity, status, and a current timestamp.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'streaks-api',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
