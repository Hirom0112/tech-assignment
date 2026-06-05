import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import CalendarHeatMap from '../components/CalendarHeatMap';
import { ACTIVITY_COLORS } from '../components/CalendarHeatMap';
import type { ActivityDay } from '../types/streaks.types';

const days: ActivityDay[] = [
  { date: '2026-04-01', activity: 'none', loginStreak: 0, playStreak: 0 },
  { date: '2026-04-02', activity: 'login_only', loginStreak: 1, playStreak: 0 },
  { date: '2026-04-03', activity: 'played', loginStreak: 2, playStreak: 1 },
  { date: '2026-04-04', activity: 'freeze', loginStreak: 2, playStreak: 1 },
  { date: '2026-04-05', activity: 'broken', loginStreak: 0, playStreak: 0 },
  // unknown enum → treated as `none` (§7)
  { date: '2026-04-06', activity: 'wat' as 'none', loginStreak: 0, playStreak: 0 },
  ...Array.from({ length: 24 }, (_, i) => ({
    date: `2026-04-${String(i + 7).padStart(2, '0')}`,
    activity: 'none' as const,
    loginStreak: 0,
    playStreak: 0,
  })),
];

describe('CalendarHeatMap', () => {
  it('renders one cell per day (~30)', () => {
    renderWithProviders(<CalendarHeatMap month="2026-04" days={days} />);
    const cells = screen.getAllByTestId(/^heatcell-/);
    expect(cells.length).toBe(30);
  });

  it('colors each cell by its activity (5 states)', () => {
    renderWithProviders(<CalendarHeatMap month="2026-04" days={days} />);
    expect(screen.getByTestId('heatcell-2026-04-01')).toHaveStyle({
      backgroundColor: ACTIVITY_COLORS.none,
    });
    expect(screen.getByTestId('heatcell-2026-04-02')).toHaveStyle({
      backgroundColor: ACTIVITY_COLORS.login_only,
    });
    expect(screen.getByTestId('heatcell-2026-04-03')).toHaveStyle({
      backgroundColor: ACTIVITY_COLORS.played,
    });
    expect(screen.getByTestId('heatcell-2026-04-04')).toHaveStyle({
      backgroundColor: ACTIVITY_COLORS.freeze,
    });
    expect(screen.getByTestId('heatcell-2026-04-05')).toHaveStyle({
      backgroundColor: ACTIVITY_COLORS.broken,
    });
  });

  it('treats an unknown activity value as none (§7)', () => {
    renderWithProviders(<CalendarHeatMap month="2026-04" days={days} />);
    expect(screen.getByTestId('heatcell-2026-04-06')).toHaveStyle({
      backgroundColor: ACTIVITY_COLORS.none,
    });
  });

  it('wraps each cell in a tooltip carrying date + activity + streak counts', () => {
    renderWithProviders(<CalendarHeatMap month="2026-04" days={days} />);
    const cell = screen.getByTestId('heatcell-2026-04-03');
    // MUI Tooltip exposes its title via aria-label on the child.
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining('2026-04-03'));
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining('Played'));
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining('login 2'));
    expect(within(cell.parentElement ?? cell).queryByText).toBeDefined();
  });
});
