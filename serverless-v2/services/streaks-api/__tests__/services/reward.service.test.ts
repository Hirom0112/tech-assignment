/**
 * Reward-service unit tests (CLAUDE.md §3 strict scope, S3). PURE logic:
 * exact-milestone detection on the post-advance streak value, points by axis,
 * and the FR-7 notification payload. No DynamoDB IO here — the atomic award
 * (the TransactWriteCommand) is exercised in the repository + integration tests.
 *
 * Detection is STATELESS w.r.t. prior awards (ARCHITECTURE §5d step 2): a reward
 * fires whenever THIS advance lands exactly on a ladder rung. "Exactly once per
 * streak instance" is enforced upstream by the per-day idempotency gate (Inv 2),
 * not by remembering past awards.
 */
import { buildMilestoneReward, detectMilestone } from '../../src/services/reward.service';

describe('reward.service — detectMilestone', () => {
  it('exact milestone fires once: login advance to 7 ⇒ one login_milestone(7, 150 pts)', () => {
    const reward = detectMilestone('login_milestone', 7, '2026-02-13T08:03:55.000Z');
    expect(reward).not.toBeNull();
    expect(reward).toMatchObject({
      type: 'login_milestone',
      milestone: 7,
      points: 150,
      streakCount: 7,
    });
  });

  it('off-rung advance to 8 ⇒ no reward', () => {
    expect(detectMilestone('login_milestone', 8, '2026-02-14T08:03:55.000Z')).toBeNull();
  });

  it('re-award after reset: reaching 7 a second time yields a NEW rewardId', () => {
    const first = detectMilestone('login_milestone', 7, '2026-02-13T08:03:55.000Z');
    // reset would take the streak back down; re-reaching 7 is a genuinely new
    // advance to the exact value — detection is stateless, so it fires again.
    const second = detectMilestone('login_milestone', 7, '2026-02-21T08:03:55.000Z');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.rewardId).not.toBe(second?.rewardId);
    // both are well-formed 7-day login rewards
    expect(second).toMatchObject({ type: 'login_milestone', milestone: 7, points: 150 });
  });

  it('play vs login points: play 7 ⇒ 300, play 3 ⇒ 100', () => {
    expect(detectMilestone('play_milestone', 7, '2026-02-13T19:42:11.000Z')?.points).toBe(300);
    expect(detectMilestone('play_milestone', 3, '2026-02-09T19:42:11.000Z')?.points).toBe(100);
  });

  it('login points: 3 ⇒ 50, 14 ⇒ 400, 30 ⇒ 1000, 60 ⇒ 2500, 90 ⇒ 5000', () => {
    expect(detectMilestone('login_milestone', 3, '2026-01-01T00:00:00.000Z')?.points).toBe(50);
    expect(detectMilestone('login_milestone', 14, '2026-01-01T00:00:00.000Z')?.points).toBe(400);
    expect(detectMilestone('login_milestone', 30, '2026-01-01T00:00:00.000Z')?.points).toBe(1000);
    expect(detectMilestone('login_milestone', 60, '2026-01-01T00:00:00.000Z')?.points).toBe(2500);
    expect(detectMilestone('login_milestone', 90, '2026-01-01T00:00:00.000Z')?.points).toBe(5000);
  });

  it('rewardId is sortable: a later award sorts after an earlier one', () => {
    const earlier = detectMilestone('login_milestone', 7, '2026-02-13T08:03:55.000Z');
    const later = detectMilestone('login_milestone', 14, '2026-02-20T08:15:02.000Z');
    expect(earlier).not.toBeNull();
    expect(later).not.toBeNull();
    // lexicographic order of the ids matches chronological order
    expect((earlier as { rewardId: string }).rewardId < (later as { rewardId: string }).rewardId).toBe(
      true,
    );
  });

  it('createdAt mirrors the supplied now instant', () => {
    const reward = detectMilestone('login_milestone', 7, '2026-02-13T08:03:55.000Z');
    expect(reward?.createdAt).toBe('2026-02-13T08:03:55.000Z');
  });
});

describe('reward.service — notification payload (FR-7)', () => {
  it('login 7 notification: title, milestone-aware body, deepLink, mirrored fields', () => {
    const reward = buildMilestoneReward('login_milestone', 7, '2026-02-13T08:03:55.000Z');
    expect(reward.notification).toEqual({
      title: '7-day login streak!',
      body: 'You earned 150 bonus points for a 7-day login streak. 14 days unlocks 400!',
      deepLink: 'hijackpoker://streaks',
      milestone: 7,
      type: 'login_milestone',
    });
  });

  it('play 7 notification body is distinct (play wording + play reward + play next reward)', () => {
    const reward = buildMilestoneReward('play_milestone', 7, '2026-02-13T19:42:11.000Z');
    expect(reward.notification.title).toBe('7-day play streak!');
    expect(reward.notification.body).toBe(
      'You earned 300 bonus points for a 7-day play streak. 14 days unlocks 800!',
    );
    expect(reward.notification.type).toBe('play_milestone');
  });

  it('login 14 notification: next rung is 30 unlocks 1000', () => {
    const reward = buildMilestoneReward('login_milestone', 14, '2026-02-20T08:15:02.000Z');
    expect(reward.notification.title).toBe('14-day login streak!');
    expect(reward.notification.body).toBe(
      'You earned 400 bonus points for a 14-day login streak. 30 days unlocks 1000!',
    );
  });

  it('top rung (90) drops the unlocks sentence — no next milestone', () => {
    const reward = buildMilestoneReward('login_milestone', 90, '2026-04-01T00:00:00.000Z');
    expect(reward.notification.body).toBe(
      "You earned 5000 bonus points for a 90-day login streak. You've reached the top tier!",
    );
    expect(reward.notification.body).not.toContain('unlocks');
  });

  it('play top rung (90) uses play points + play wording, still drops the second sentence', () => {
    const reward = buildMilestoneReward('play_milestone', 90, '2026-04-01T00:00:00.000Z');
    expect(reward.notification.body).toBe(
      "You earned 10000 bonus points for a 90-day play streak. You've reached the top tier!",
    );
  });

  it('buildMilestoneReward throws on a non-milestone value (programming error)', () => {
    expect(() => buildMilestoneReward('login_milestone', 8, '2026-01-01T00:00:00.000Z')).toThrow();
  });
});
