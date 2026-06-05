/**
 * Login streak domain logic (CLAUDE.md §3 strict scope, Inv 6).
 *
 * PURE: every function here takes plain values and returns plain values. No
 * DynamoDB IO lives here — the handler computes today/yesterday once at the
 * edge (Inv 1), loads the player via the repository, calls this service, and
 * the repository performs the conditional writes (Inv 6).
 *
 * S1 covers the login axis only. Freeze evaluation (S4) and milestone reward
 * awarding (S3) are out of scope; the gap≥2 / no-freeze branch resets to 1.
 */
import { MILESTONES } from '../config/milestones';
import { nowIso } from '../lib/utc';
import type { ActivityDay, NextMilestone, PlayerStreak } from '../domain/types';

/** The outcome of applying a login check-in to a player's state. */
export interface LoginCheckInResult {
  /** The next player record to persist. */
  player: PlayerStreak;
  /**
   * The activity row to write for today, or `null` when this is a same-day
   * repeat (no new row — the existing one is the idempotency record).
   */
  activity: ActivityDay | null;
  /** `true` only when THIS call mutated streak state (first check-in today). */
  streakAdvanced: boolean;
}

/**
 * Apply a login check-in. `player` is the loaded record, or `null` for a
 * never-seen player. `today`/`yesterday` are UTC `YYYY-MM-DD` strings computed
 * once at the handler edge.
 */
export function applyLoginCheckIn(
  player: PlayerStreak | null,
  playerId: string,
  today: string,
  yesterday: string,
): LoginCheckInResult {
  const now = nowIso();

  // New player → first check-in ever.
  if (player === null) {
    return buildAdvance(newPlayer(playerId, now), playerId, 1, false, today, now);
  }

  // Same-day repeat: fast-path no-op. The activity row's
  // attribute_not_exists(#date) condition at the repository is the true source
  // of truth (DATA_MODEL.md §7 pattern D); this just short-circuits the math.
  if (player.lastLoginDate === today) {
    return { player, activity: null, streakAdvanced: false };
  }

  // Decide the login transition.
  let nextLogin: number;
  let broken: boolean;
  if (player.lastLoginDate === yesterday) {
    nextLogin = player.loginStreak + 1;
    broken = false;
  } else {
    // Gap ≥ 2 (or some prior date that is not yesterday) with no freeze in S1
    // ⇒ reset to 1 and mark the day as a streak break (FR-1.5).
    nextLogin = 1;
    broken = true;
  }

  return buildAdvance(player, playerId, nextLogin, broken, today, now);
}

/**
 * The next unreached login milestone, or `null` when the streak is at/above the
 * top rung (90). `daysRemaining = days - streak` (API_CONTRACT.md §4.1).
 */
export function nextLoginMilestone(loginStreak: number): NextMilestone {
  const next = MILESTONES.find((m) => m.days > loginStreak);
  if (next === undefined) {
    return null;
  }
  return { days: next.days, reward: next.loginReward, daysRemaining: next.days - loginStreak };
}

/**
 * The next unreached play milestone, or `null` at/above 90. Mirrors
 * `nextLoginMilestone` but reports the play reward (API_CONTRACT.md §4.1).
 */
export function nextPlayMilestone(playStreak: number): NextMilestone {
  const next = MILESTONES.find((m) => m.days > playStreak);
  if (next === undefined) {
    return null;
  }
  return { days: next.days, reward: next.playReward, daysRemaining: next.days - playStreak };
}

/** Build the advanced player + today's activity row. */
function buildAdvance(
  base: PlayerStreak,
  playerId: string,
  nextLogin: number,
  broken: boolean,
  today: string,
  now: string,
): LoginCheckInResult {
  const player: PlayerStreak = {
    ...base,
    playerId,
    loginStreak: nextLogin,
    bestLoginStreak: Math.max(base.bestLoginStreak, nextLogin),
    lastLoginDate: today,
    updatedAt: now,
  };
  const activity: ActivityDay = {
    playerId,
    date: today,
    loggedIn: true,
    played: false,
    freezeUsed: false,
    streakBroken: broken,
    loginStreakAtDay: nextLogin,
    playStreakAtDay: player.playStreak,
    timestamp: now,
  };
  return { player, activity, streakAdvanced: true };
}

/** A zero-state player record for a never-seen player. */
function newPlayer(playerId: string, now: string): PlayerStreak {
  return {
    playerId,
    loginStreak: 0,
    playStreak: 0,
    bestLoginStreak: 0,
    bestPlayStreak: 0,
    lastLoginDate: null,
    lastPlayDate: null,
    freezesAvailable: 0,
    freezesUsedThisMonth: 0,
    lastFreezeGrantDate: null,
    createdAt: now,
    updatedAt: now,
  };
}
