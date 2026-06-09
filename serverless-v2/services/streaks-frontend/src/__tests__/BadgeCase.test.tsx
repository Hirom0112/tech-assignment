import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import BadgeCase from '../components/BadgeCase';

describe('BadgeCase — Trophy Shelf (MSW-backed)', () => {
  it('renders the header + subtitle and both the LOGIN and PLAY rows', async () => {
    renderWithProviders(<BadgeCase />);
    expect(await screen.findByText('Trophy Shelf')).toBeInTheDocument();
    expect(
      await screen.findByText(/Lifetime ranks — your best streak ever\. Once earned, always yours\./i)
    ).toBeInTheDocument();
    expect(await screen.findByText('Login')).toBeInTheDocument();
    expect(await screen.findByText('Play')).toBeInTheDocument();
  });

  it('renders earned medallions with full-colour, meaningful alt text', async () => {
    renderWithProviders(<BadgeCase />);
    // Earned login rung (3-day → Greenhorn) is present with an accessible alt.
    const greenhorn = await screen.findByAltText(
      'Greenhorn badge (3-day login streak) — earned'
    );
    expect(greenhorn).toBeInTheDocument();
    expect(greenhorn).toHaveAttribute('src', '/assets/dashboard/badges/badge-login-3.png');
    // Earned play rung (7-day → Card Sharp).
    expect(
      await screen.findByAltText('Card Sharp badge (7-day play streak) — earned')
    ).toBeInTheDocument();
  });

  it('marks unearned rungs as locked via data-testid="badge-locked"', async () => {
    renderWithProviders(<BadgeCase />);
    // login 30/60/90 + play 14/30/60/90 = 7 locked rungs in the mock payload.
    const locked = await screen.findAllByTestId('badge-locked');
    expect(locked.length).toBe(7);
    // a specifically-locked rung carries the "locked" alt text
    expect(
      await screen.findByAltText('Marshal badge (30-day login streak) — locked')
    ).toBeInTheDocument();
  });

  it('shows the day count + rank name under each medallion', async () => {
    renderWithProviders(<BadgeCase />);
    // Day count and rank name render on two lines within one label.
    // Day count and rank name render on two lines within one label.
    expect((await screen.findAllByText('14 Days')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Sheriff')).toBeInTheDocument(); // login rung 14
    expect(await screen.findByText("Dead Man's Hand")).toBeInTheDocument(); // play rung 14
  });
});
