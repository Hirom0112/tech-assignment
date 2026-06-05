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
 * The response body for `POST /internal/streaks/hand-completed` (§4.6).
 *
 * `date` is the UTC calendar day of the hand's `completedAt` (Inv 1), NOT now.
 * `playStreakUpdated` is `true` only for the first hand of that UTC day, `false`
 * for same-day repeats. In S2 `milestoneEarned` is always `null` (play-milestone
 * reward awarding is S3); the field is wired now to lock the wire shape.
 */
export interface HandCompletedResponse {
  playerId: string;
  date: string;
  playStreakUpdated: boolean;
  playStreak: number;
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
 * One consumed-freeze row (`streaks-freeze-history` — DATA_MODEL.md §6).
 * PK `playerId`, SK `date` (the UTC `YYYY-MM-DD` the freeze protected). The SK
 * makes consumption idempotent per day (a day is protected at most once) and
 * sorts history chronologically by Query. `source` records which balance the
 * consumed freeze came from (FR-3.1/3.2). The §4.5 wire surfaces `{date, source}`.
 */
export interface FreezeRecord {
  playerId: string;
  date: string;
  source: 'free_monthly' | 'purchased';
  createdAt: string;
}

/**
 * The §4.5 `GET /api/v1/player/streaks/freezes` response (freeze-status UI,
 * FR-4.6). `history` lists freeze CONSUMPTION events newest-first by `date`;
 * grants are reflected in `freezesAvailable` / `lastFreezeGrantDate`, not here.
 */
export interface FreezesResponse {
  freezesAvailable: number;
  freezesUsedThisMonth: number;
  lastFreezeGrantDate: string | null;
  history: Array<{ date: string; source: 'free_monthly' | 'purchased' }>;
}

/**
 * The §4.7 `POST /api/v1/admin/streaks/freezes/grant` response. `granted` echoes
 * the `count` applied; granted freezes are always `source:"purchased"` (the
 * monthly free grant is the only `free_monthly` source).
 */
export interface AdminGrantResponse {
  playerId: string;
  granted: number;
  freezesAvailable: number;
  source: 'purchased';
  updatedAt: string;
}

/**
 * The §4.8 `GET /api/v1/admin/streaks/players/{playerId}/history` composite —
 * a read-only superset of the player endpoints, stitched into one admin call
 * (FR-8). It introduces NO new sub-shapes: `player` is the §4.1 streaks object,
 * `activity` reuses the §4.3 calendar-day shape, `rewards` reuses the §4.4
 * reward wire, and `freezes` reuses the §4.5 freezes response. A change to any
 * sub-shape flows through here automatically (API_CONTRACT.md §4.8 "No new
 * fields"). `activity` covers the recent 60-day window, ascending by date.
 */
export interface AdminHistoryResponse {
  player: StreaksResponse;
  activity: Array<{ date: string; activity: string; loginStreak: number; playStreak: number }>;
  rewards: RewardRecord[];
  freezes: FreezesResponse;
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
