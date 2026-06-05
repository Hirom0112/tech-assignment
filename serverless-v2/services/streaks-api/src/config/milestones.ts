/**
 * Streak milestone ladder — THE single source of truth (CLAUDE.md §3).
 *
 * Rewards are awarded at specific streak lengths. `loginReward` applies to the
 * login streak, `playReward` to the play streak. constants.ts re-exports these
 * so there is exactly one ladder array in the codebase.
 */

export interface Milestone {
  days: number;
  loginReward: number;
  playReward: number;
  description: string;
}

export const MILESTONES: readonly Milestone[] = [
  { days: 3, loginReward: 50, playReward: 100, description: '3-day streak' },
  { days: 7, loginReward: 150, playReward: 300, description: '7-day streak' },
  { days: 14, loginReward: 400, playReward: 800, description: '14-day streak' },
  { days: 30, loginReward: 1000, playReward: 2000, description: '30-day streak' },
  { days: 60, loginReward: 2500, playReward: 5000, description: '60-day streak' },
  { days: 90, loginReward: 5000, playReward: 10000, description: '90-day streak' },
];

/**
 * The milestone hit at exactly `streakLength` days, or null if none.
 */
export function getMilestone(streakLength: number): Milestone | null {
  return MILESTONES.find((m) => m.days === streakLength) ?? null;
}

/**
 * All milestones achieved at or below `streakLength` days.
 */
export function getAchievedMilestones(streakLength: number): Milestone[] {
  return MILESTONES.filter((m) => m.days <= streakLength);
}
