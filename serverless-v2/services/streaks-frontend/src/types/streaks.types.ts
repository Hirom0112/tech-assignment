// Wire types mirroring API_CONTRACT.md §5.5 / §4. Strict — no `any`.

/** Calendar day status (§5.1). Clients MUST tolerate unknown values → treat as `none` (§7). */
export type Activity = 'none' | 'login_only' | 'played' | 'freeze' | 'broken';

/** Next-milestone object (§5.5). `null` when streak is at/above 90. */
export interface Milestone {
  days: number;
  reward: number;
  daysRemaining: number;
}

/** GET /streaks and check-in.streaks — the 9-field streaks object (§4.1). */
export interface StreaksResponse {
  loginStreak: number;
  playStreak: number;
  bestLoginStreak: number;
  bestPlayStreak: number;
  freezesAvailable: number;
  nextLoginMilestone: Milestone | null;
  nextPlayMilestone: Milestone | null;
  lastLoginDate: string | null;
  lastPlayDate: string | null;
}

export type MilestoneType = 'login_milestone' | 'play_milestone';

/** Push-notification content payload (§5.5, FR-7) — content only, no delivery. */
export interface Notification {
  title: string;
  body: string;
  deepLink: string;
  milestone: number;
  type: MilestoneType;
}

/** Reward object (§4.4, §5.5). */
export interface RewardRecord {
  rewardId: string;
  type: MilestoneType;
  milestone: number;
  points: number;
  streakCount: number;
  createdAt: string;
  notification: Notification;
}

/** One calendar day (§4.3). */
export interface ActivityDay {
  date: string;
  activity: Activity;
  loginStreak: number;
  playStreak: number;
}

/** GET /calendar (§4.3). */
export interface CalendarResponse {
  month: string;
  days: ActivityDay[];
}

export type FreezeSource = 'free_monthly' | 'purchased';

export interface FreezeEvent {
  date: string;
  source: FreezeSource;
}

/** GET /freezes (§4.5). */
export interface FreezesResponse {
  freezesAvailable: number;
  freezesUsedThisMonth: number;
  lastFreezeGrantDate: string | null;
  history: FreezeEvent[];
}

/** POST /check-in (§4.2). */
export interface CheckInResponse {
  playerId: string;
  checkedInToday: boolean;
  streakAdvanced: boolean;
  freezeConsumed: boolean;
  streaks: StreaksResponse;
  milestoneEarned: RewardRecord | null;
}
