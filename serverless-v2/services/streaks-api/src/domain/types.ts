/**
 * Domain types for the Streaks engine (Inv 9 — strict TS, no `any`).
 *
 * These mirror DATA_MODEL.md (stored shapes) and API_CONTRACT.md (wire shapes)
 * byte-for-byte. DATA_MODEL.md is canonical for storage; API_CONTRACT.md is
 * canonical for the wire. When they disagree, follow CLAUDE.md doc precedence.
 */

/**
 * The stored player aggregate (`streaks-players` table — DATA_MODEL.md §2).
 * One item per player. `username` is optional (relies on
 * `removeUndefinedValues: true`). Date fields are UTC `YYYY-MM-DD`;
 * `lastFreezeGrantDate` is UTC `YYYY-MM`.
 */
export interface PlayerStreak {
  playerId: string;
  username?: string;
  loginStreak: number;
  playStreak: number;
  bestLoginStreak: number;
  bestPlayStreak: number;
  lastLoginDate: string | null;
  lastPlayDate: string | null;
  freezesAvailable: number;
  freezesUsedThisMonth: number;
  lastFreezeGrantDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One per-day activity row (`streaks-activity` table — DATA_MODEL.md §3).
 * PK `playerId`, SK `date` (`YYYY-MM-DD` UTC). Both the heat-map source and the
 * once-per-UTC-day idempotency key.
 */
export interface ActivityDay {
  playerId: string;
  date: string;
  loggedIn: boolean;
  played: boolean;
  freezeUsed: boolean;
  streakBroken: boolean;
  loginStreakAtDay: number;
  playStreakAtDay: number;
  timestamp: string;
}

/**
 * The next unreached milestone for a streak axis, or `null` when the streak is
 * at/above the top rung (90). `daysRemaining = days - streak`
 * (API_CONTRACT.md §4.1 / §5.5).
 */
export type NextMilestone = {
  days: number;
  reward: number;
  daysRemaining: number;
} | null;

/**
 * The 9-field streak view returned by `GET /api/v1/player/streaks` (§4.1) and
 * nested as `streaks` inside the check-in response (§4.2). Dates are
 * `YYYY-MM-DD` or `null` for a brand-new player.
 */
export interface StreaksResponse {
  loginStreak: number;
  playStreak: number;
  bestLoginStreak: number;
  bestPlayStreak: number;
  freezesAvailable: number;
  nextLoginMilestone: NextMilestone;
  nextPlayMilestone: NextMilestone;
  lastLoginDate: string | null;
  lastPlayDate: string | null;
}

/**
 * The response body for `POST /api/v1/player/streaks/check-in` (§4.2).
 *
 * In S1 `freezeConsumed` is always `false` (freeze logic is S4) and
 * `milestoneEarned` is always `null` (reward awarding is S3); both fields are
 * wired now to lock the wire shape.
 */
export interface CheckInResponse {
  playerId: string;
  checkedInToday: boolean;
  streakAdvanced: boolean;
  freezeConsumed: boolean;
  streaks: StreaksResponse;
  milestoneEarned: RewardRecord | null;
}

/**
 * A milestone reward record (`streaks-rewards` — DATA_MODEL.md §4, wire shape
 * API_CONTRACT.md §5.5). Defined here so `CheckInResponse.milestoneEarned` is
 * typed; reward awarding itself lands in S3.
 */
export interface RewardRecord {
  rewardId: string;
  type: 'login_milestone' | 'play_milestone';
  milestone: number;
  points: number;
  streakCount: number;
  createdAt: string;
  notification: NotificationPayload;
}

/**
 * Push-notification content payload (FR-7), stored as the `notification` Map on
 * a reward item (DATA_MODEL.md §5). Content only — no delivery.
 */
export interface NotificationPayload {
  title: string;
  body: string;
  deepLink: string;
  milestone: number;
  type: 'login_milestone' | 'play_milestone';
}
