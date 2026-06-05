/**
 * Streak constants. The milestone ladder lives in `milestones.ts` (single
 * source of truth); this module re-exports it so existing importers of
 * `config/constants` keep working.
 */
export {
  MILESTONES,
  getMilestone,
  getAchievedMilestones,
  type Milestone,
} from './milestones';
