/**
 * Express Request augmentation: the stubbed player-auth middleware (Inv 10)
 * attaches the authenticated player id to the request.
 */
import 'express';

declare global {
  namespace Express {
    interface Request {
      playerId?: string;
    }
  }
}
