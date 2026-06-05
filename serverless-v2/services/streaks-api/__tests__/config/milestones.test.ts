import { getMilestone, getAchievedMilestones, MILESTONES } from '../../src/config/milestones';

describe('config/milestones — reward ladder', () => {
  it('getMilestone(7) returns the 7-day milestone with loginReward 150', () => {
    const milestone = getMilestone(7);
    expect(milestone?.loginReward).toBe(150);
  });

  it('getMilestone returns null when no milestone is hit exactly', () => {
    expect(getMilestone(8)).toBeNull();
  });

  it('getAchievedMilestones(7) returns the 3-day and 7-day milestones', () => {
    expect(getAchievedMilestones(7).map((m) => m.days)).toEqual([3, 7]);
  });

  it('exposes the full 6-rung ladder', () => {
    expect(MILESTONES.map((m) => m.days)).toEqual([3, 7, 14, 30, 60, 90]);
  });
});
