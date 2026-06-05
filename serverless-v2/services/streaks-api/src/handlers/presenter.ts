/**
 * Wire-shape presenters (Inv 7). Pure mapping from the stored `PlayerStreak`
 * record to the API_CONTRACT.md §4.1 nine-field `StreaksResponse`. Kept out of
 * the handlers so the shape lives in exactly one place.
 */
import { nextLoginMilestone, nextPlayMilestone } from '../services/streak.service';
import { deriveActivity, type CalendarDay } from '../services/calendar.service';
import type {
  ActivityDay,
  AdminHistoryResponse,
  FreezeRecord,
  FreezesResponse,
  PlayerStreak,
  RewardRecord,
  StreaksResponse,
} from '../domain/types';

/** Map a stored player record to the §4.1 nine-field streak view. */
export function toStreaksResponse(player: PlayerStreak): StreaksResponse {
  return {
    loginStreak: player.loginStreak,
    playStreak: player.playStreak,
    bestLoginStreak: player.bestLoginStreak,
    bestPlayStreak: player.bestPlayStreak,
    freezesAvailable: player.freezesAvailable,
    nextLoginMilestone: nextLoginMilestone(player.loginStreak),
    nextPlayMilestone: nextPlayMilestone(player.playStreak),
    lastLoginDate: player.lastLoginDate,
    lastPlayDate: player.lastPlayDate,
  };
}

/**
 * Project a stored reward row to the API_CONTRACT.md §4.4 wire shape. The stored
 * row carries internal-only fields — `playerId` (the PK) and
 * `pointTxnType:'streak_bonus'` (the folded ledger txn) — that are NOT surfaced
 * on the wire; the stored `notification` Map may also persist `points`/`createdAt`
 * conveniences (DATA_MODEL.md §5) which we likewise drop. This presenter is the
 * single place that decides what `…/rewards` and `milestoneEarned` expose, so the
 * wire stays exactly the §4.4 `{rewardId,type,milestone,points,streakCount,
 * createdAt,notification{title,body,deepLink,milestone,type}}`.
 */
export function toRewardWire(reward: RewardRecord): RewardRecord {
  const { notification } = reward;
  return {
    rewardId: reward.rewardId,
    type: reward.type,
    milestone: reward.milestone,
    points: reward.points,
    streakCount: reward.streakCount,
    createdAt: reward.createdAt,
    notification: {
      title: notification.title,
      body: notification.body,
      deepLink: notification.deepLink,
      milestone: notification.milestone,
      type: notification.type,
    },
  };
}

/**
 * The canonical zero-state view for an authenticated player never seen before
 * (ASSUMPTIONS): all counters 0, both next-milestones the 3-day rung, dates
 * null. Returned as 200, NOT 404.
 */
export function zeroStreaksResponse(): StreaksResponse {
  return {
    loginStreak: 0,
    playStreak: 0,
    bestLoginStreak: 0,
    bestPlayStreak: 0,
    freezesAvailable: 0,
    nextLoginMilestone: nextLoginMilestone(0),
    nextPlayMilestone: nextPlayMilestone(0),
    lastLoginDate: null,
    lastPlayDate: null,
  };
}

/**
 * Project a stored activity row to the §4.3 calendar-day wire shape
 * (`{date, activity, loginStreak, playStreak}`), collapsing the booleans via the
 * SAME `deriveActivity` priority the calendar uses (DATA_MODEL §3). The admin
 * history surfaces the REAL rows over its window (not a densified month), so this
 * maps one stored row → one wire day.
 */
function toActivityWire(row: ActivityDay): CalendarDay {
  return {
    date: row.date,
    activity: deriveActivity(row),
    loginStreak: row.loginStreakAtDay,
    playStreak: row.playStreakAtDay,
  };
}

/**
 * Project the stored freeze rows to the §4.5 `{date, source}` wire (drops the
 * internal `createdAt`/PK) — the same shape `GET …/freezes` exposes.
 */
function toFreezesWire(
  player: PlayerStreak,
  history: FreezeRecord[],
): FreezesResponse {
  return {
    freezesAvailable: player.freezesAvailable,
    freezesUsedThisMonth: player.freezesUsedThisMonth,
    lastFreezeGrantDate: player.lastFreezeGrantDate,
    history: history.map((row) => ({ date: row.date, source: row.source })),
  };
}

/**
 * Assemble the §4.8 admin view-history composite from the loaded parts (FR-8).
 * Pure mapping — it REUSES the existing per-endpoint presenters so it stays in
 * lock-step with §4.1/§4.3/§4.4/§4.5 and introduces no new wire fields. The
 * handler owns the repository reads; this owns the single composite shape.
 *
 *   · `player`  → `toStreaksResponse` (the §4.1 nine-field object);
 *   · `activity`→ the recent rows mapped via `toActivityWire`, ascending by date
 *     (the repository Query already returns them ascending);
 *   · `rewards` → `toRewardWire` over the newest-first reward rows (incl. the
 *     FR-7 `notification`);
 *   · `freezes` → the §4.5 balance + `{date, source}` history.
 */
export function toAdminHistoryResponse(
  player: PlayerStreak,
  activity: ActivityDay[],
  rewards: RewardRecord[],
  freezeHistory: FreezeRecord[],
): AdminHistoryResponse {
  return {
    player: toStreaksResponse(player),
    activity: activity.map(toActivityWire),
    rewards: rewards.map(toRewardWire),
    freezes: toFreezesWire(player, freezeHistory),
  };
}
