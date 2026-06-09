import type { BadgeTier } from '../types/streaks.types';

/**
 * The canonical milestone → badge-name map, shared so the Trophy Shelf and the
 * "Next badge" hint on the milestone panel stay in lock-step (and in lock-step
 * with the API, which returns these same names). One source of truth — see
 * `public/assets/dashboard/badges/README.md` for the art ↔ name ↔ tier table.
 *
 * Two themed ladders: LOGIN ranks are Lawman; PLAY ranks are Gunslinger.
 * Material/`tier` is visual-only and always ascends tin → platinum.
 */

export type StreakAxis = 'login' | 'play';

/** The milestone ladder both axes share (ascending). */
export const BADGE_MILESTONES = [3, 7, 14, 30, 60, 90] as const;

export type BadgeMilestone = (typeof BADGE_MILESTONES)[number];

interface BadgeMeta {
  name: string;
  tier: BadgeTier;
}

/** milestone → { name, tier } for each axis. */
export const BADGE_NAMES: Record<StreakAxis, Record<BadgeMilestone, BadgeMeta>> = {
  login: {
    3: { name: 'Greenhorn', tier: 'tin' },
    7: { name: 'Deputy', tier: 'copper' },
    14: { name: 'Sheriff', tier: 'bronze' },
    30: { name: 'Marshal', tier: 'silver' },
    60: { name: 'Ranger Captain', tier: 'gold' },
    90: { name: 'Frontier Legend', tier: 'platinum' },
  },
  play: {
    3: { name: 'Anted In', tier: 'tin' },
    7: { name: 'Card Sharp', tier: 'copper' },
    14: { name: "Dead Man's Hand", tier: 'bronze' },
    30: { name: 'Quick Draw', tier: 'silver' },
    60: { name: 'High Roller', tier: 'gold' },
    90: { name: 'Royal Flush', tier: 'platinum' },
  },
};

/** The badge name for an axis + milestone, or undefined if off the ladder. */
export function badgeName(axis: StreakAxis, milestone: number): string | undefined {
  return BADGE_NAMES[axis][milestone as BadgeMilestone]?.name;
}

/** The PNG path for a badge medallion. */
export function badgeSrc(axis: StreakAxis, milestone: number): string {
  return `/assets/dashboard/badges/badge-${axis}-${milestone}.png`;
}
