/**
 * Milestone-reward domain logic (CLAUDE.md §3 strict scope, Inv 6, S3).
 *
 * PURE: takes plain values (the milestone `type`, the post-advance streak value,
 * the request's `now` instant) and returns a plain `RewardRecord` — no DynamoDB
 * IO. The handler decides WHEN to award (a counter advance landing exactly on a
 * ladder rung); the repository's `awardMilestone` TransactWriteCommand decides
 * HOW it is persisted atomically (Inv 4).
 *
 * Detection is STATELESS w.r.t. prior awards (ARCHITECTURE §5d step 2): a reward
 * fires whenever THIS advance hits the exact ladder value. "Exactly once per
 * streak instance" is upheld upstream by the per-day idempotency gate (Inv 2)
 * and the `attribute_not_exists(rewardId)` guard on the reward Put — never by
 * remembering past awards here.
 */
import { getMilestone, getNextMilestone } from '../config/milestones';
import { epochMillis } from '../lib/utc';
import type { RewardRecord } from '../domain/types';

/** The milestone reward axis. Mirrors `RewardRecord.type`. */
export type MilestoneType = 'login_milestone' | 'play_milestone';

/**
 * If `newStreakValue` lands exactly on a milestone rung, return the fully-built
 * reward for this advance; otherwise `null`. `now` is the request's instant
 * (the check-in's now / the hand's completedAt — Inv 1) and becomes the reward's
 * `createdAt` and the time-ordered prefix of its `rewardId`.
 *
 * Uses `getMilestone()` EXACT match on the NEW post-advance value (advancing to
 * 7 fires; advancing to 8 does not), so each rung is hit once per streak
 * instance (DATA_MODEL.md §9).
 */
export function detectMilestone(
  type: MilestoneType,
  newStreakValue: number,
  now: string,
): RewardRecord | null {
  if (getMilestone(newStreakValue) === null) {
    return null;
  }
  return buildMilestoneReward(type, newStreakValue, now);
}

/**
 * Assemble the full §4.4 reward record for an exact-match milestone, including
 * the FR-7 `notification` payload. Throws if `milestone` is not a ladder rung
 * (a programming error — callers gate on `detectMilestone`/`getMilestone`).
 */
export function buildMilestoneReward(
  type: MilestoneType,
  milestone: number,
  now: string,
): RewardRecord {
  const rung = getMilestone(milestone);
  if (rung === null) {
    throw new Error(`Not a milestone value: ${milestone}`);
  }
  const points = type === 'login_milestone' ? rung.loginReward : rung.playReward;

  return {
    rewardId: makeRewardId(now),
    type,
    milestone,
    points,
    streakCount: milestone,
    createdAt: now,
    notification: {
      title: `${milestone}-day ${axisWord(type)} streak!`,
      body: buildBody(type, milestone, points),
      deepLink: 'hijackpoker://streaks',
      milestone,
      type,
    },
  };
}

/** `'login'` / `'play'` for the human-facing notification copy. */
function axisWord(type: MilestoneType): 'login' | 'play' {
  return type === 'login_milestone' ? 'login' : 'play';
}

/**
 * Milestone-aware notification body (FR-7.3), distinct for login vs play.
 * Format: `"You earned {points} bonus points for a {milestone}-day {axis}
 * streak. {nextDays} days unlocks {nextReward}!"`. On the top rung (90 — no next
 * milestone) the second sentence becomes the top-tier line.
 */
function buildBody(type: MilestoneType, milestone: number, points: number): string {
  const axis = axisWord(type);
  const head = `You earned ${points} bonus points for a ${milestone}-day ${axis} streak.`;
  const next = getNextMilestone(milestone);
  if (next === null) {
    return `${head} You've reached the top tier!`;
  }
  const nextReward = type === 'login_milestone' ? next.loginReward : next.playReward;
  return `${head} ${next.days} days unlocks ${nextReward}!`;
}

/**
 * A zero-dep, lexicographically-sortable, time-ordered reward id (ASSUMPTIONS
 * A-7 — chosen over ulid to keep the dep budget intact, STND-5). A 15-digit
 * zero-padded epoch-millis prefix sorts ascending by time, so a reward `Query`
 * with `ScanIndexForward=false` returns newest-first directly (DATA_MODEL.md §7
 * pattern H); the random suffix disambiguates same-millisecond awards.
 */
function makeRewardId(now: string): string {
  const prefix = String(epochMillis(now)).padStart(15, '0');
  const suffix = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `${prefix}-${suffix}`;
}
