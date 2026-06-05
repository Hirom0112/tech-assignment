/**
 * Wire-shape presenters (Inv 7). Pure mapping from the stored `PlayerStreak`
 * record to the API_CONTRACT.md §4.1 nine-field `StreaksResponse`. Kept out of
 * the handlers so the shape lives in exactly one place.
 */
import { nextLoginMilestone, nextPlayMilestone } from '../services/streak.service';
import type { PlayerStreak, RewardRecord, StreaksResponse } from '../domain/types';

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
