import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../test/renderWithProviders';
import { server } from '../test/mocks/server';
import StreakDashboard from '../components/StreakDashboard';

describe('StreakDashboard (MSW-backed, real Provider)', () => {
  it('renders the title, both counters, milestone copy, freeze, and rewards', async () => {
    renderWithProviders(<StreakDashboard />);

    expect(
      await screen.findByText(/Hijack Daily Streaks/i)
    ).toBeInTheDocument();
    // login + play counters
    expect(await screen.findByText('Login Streak')).toBeInTheDocument();
    expect(await screen.findByText('Play Streak')).toBeInTheDocument();
    // milestone copy from getStreaks mock
    expect(
      await screen.findByText(/Log in 2 more days to earn 400 bonus points!/i)
    ).toBeInTheDocument();
    // heat map cells
    expect(
      (await screen.findAllByTestId(/^heatcell-/)).length
    ).toBeGreaterThanOrEqual(30);
    // freeze + rewards (their own fetches)
    expect(await screen.findByText(/Streak Freezes/i)).toBeInTheDocument();
    expect(await screen.findByText(/7-day login milestone/i)).toBeInTheDocument();
  });

  it('fires a check-in mutation when the button is clicked', async () => {
    let hit = false;
    server.use(
      http.post(
        'http://localhost:5001/api/v1/player/streaks/check-in',
        () => {
          hit = true;
          return HttpResponse.json({
            playerId: 'streak-001',
            checkedInToday: true,
            streakAdvanced: true,
            freezeConsumed: false,
            streaks: {
              loginStreak: 13,
              playStreak: 5,
              bestLoginStreak: 45,
              bestPlayStreak: 22,
              freezesAvailable: 2,
              nextLoginMilestone: { days: 14, reward: 400, daysRemaining: 1 },
              nextPlayMilestone: { days: 7, reward: 300, daysRemaining: 2 },
              lastLoginDate: '2026-04-21',
              lastPlayDate: '2026-04-19',
            },
            milestoneEarned: null,
          });
        }
      )
    );

    renderWithProviders(<StreakDashboard />);
    const btn = await screen.findByRole('button', { name: /Check in today/i });
    await userEvent.click(btn);
    expect(await screen.findByText(/Checked in — streak advanced!/i)).toBeInTheDocument();
    expect(hit).toBe(true);
  });

  it('display-clamps the counters at 365 (FR-1.7)', async () => {
    server.use(
      http.get('http://localhost:5001/api/v1/player/streaks', () =>
        HttpResponse.json({
          loginStreak: 999,
          playStreak: 5,
          bestLoginStreak: 1000,
          bestPlayStreak: 22,
          freezesAvailable: 2,
          nextLoginMilestone: null,
          nextPlayMilestone: { days: 7, reward: 300, daysRemaining: 2 },
          lastLoginDate: '2026-04-20',
          lastPlayDate: '2026-04-19',
        })
      )
    );
    renderWithProviders(<StreakDashboard />);
    // 999 clamps to 365 in display.
    expect(await screen.findAllByText('365')).toBeTruthy();
    expect(screen.queryByText('999')).not.toBeInTheDocument();
  });
});
