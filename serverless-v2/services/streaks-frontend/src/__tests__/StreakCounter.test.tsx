import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import StreakCounter from '../components/StreakCounter';

describe('StreakCounter', () => {
  it('renders the login number with a flame motif and the play number with a cards motif', () => {
    renderWithProviders(
      <StreakCounter
        label="Login Streak"
        value={12}
        best={45}
        motif="flame"
      />
    );
    // the streak number shows as the big stat AND embossed on the flames
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
    expect(screen.getByText('Login Streak')).toBeInTheDocument();
    expect(screen.getByTestId('motif-flame')).toBeInTheDocument();
    expect(screen.getByText(/Best:\s*45/)).toBeInTheDocument();
  });

  it('renders the play number with a cards motif', () => {
    renderWithProviders(
      <StreakCounter label="Play Streak" value={5} best={22} motif="cards" />
    );
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByTestId('motif-cards')).toBeInTheDocument();
  });

  it('grows the flame scale as the streak increases', () => {
    const { unmount } = renderWithProviders(
      <StreakCounter label="Login" value={1} best={1} motif="flame" />
    );
    const small = screen.getByTestId('motif-flame');
    const smallScale = small.style.transform;
    unmount();

    renderWithProviders(
      <StreakCounter label="Login" value={50} best={50} motif="flame" />
    );
    const big = screen.getByTestId('motif-flame');
    const bigScale = big.style.transform;

    // transform is `scale(N)` or `scale(calc(N * var(--flame-mult, 1)))`
    const num = (t: string) => Number(t.match(/scale\((?:calc\()?([\d.]+)/)?.[1] ?? '0');
    expect(num(bigScale)).toBeGreaterThan(num(smallScale));
  });
});
