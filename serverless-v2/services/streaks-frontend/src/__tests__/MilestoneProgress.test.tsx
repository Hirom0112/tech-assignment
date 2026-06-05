import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import MilestoneProgress from '../components/MilestoneProgress';

describe('MilestoneProgress', () => {
  it('renders next-milestone copy for both streaks', () => {
    renderWithProviders(
      <MilestoneProgress
        loginStreak={12}
        playStreak={5}
        nextLoginMilestone={{ days: 14, reward: 400, daysRemaining: 2 }}
        nextPlayMilestone={{ days: 7, reward: 300, daysRemaining: 2 }}
      />
    );
    expect(
      screen.getByText(/Play 2 more days to earn 300 bonus points!/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Log in 2 more days to earn 400 bonus points!/i)
    ).toBeInTheDocument();
  });

  it('shows progress bars for both axes', () => {
    renderWithProviders(
      <MilestoneProgress
        loginStreak={12}
        playStreak={5}
        nextLoginMilestone={{ days: 14, reward: 400, daysRemaining: 2 }}
        nextPlayMilestone={{ days: 7, reward: 300, daysRemaining: 2 }}
      />
    );
    const bars = screen.getAllByRole('progressbar');
    expect(bars.length).toBe(2);
  });

  it('handles a null next-milestone (>=90) with a max-reached message', () => {
    renderWithProviders(
      <MilestoneProgress
        loginStreak={90}
        playStreak={5}
        nextLoginMilestone={null}
        nextPlayMilestone={{ days: 7, reward: 300, daysRemaining: 2 }}
      />
    );
    expect(screen.getByText(/Max milestone reached/i)).toBeInTheDocument();
  });
});
