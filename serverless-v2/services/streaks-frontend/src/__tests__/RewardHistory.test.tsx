import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import RewardHistory from '../components/RewardHistory';

describe('RewardHistory (MSW-backed)', () => {
  it('lists each reward with milestone, type, date, and points from /rewards', async () => {
    renderWithProviders(<RewardHistory />);
    expect(await screen.findByText(/7-day login streak/i)).toBeInTheDocument();
    expect(await screen.findByText(/3-day play streak/i)).toBeInTheDocument();
    expect(await screen.findByText('+150')).toBeInTheDocument();
    expect(await screen.findByText('+100')).toBeInTheDocument();
    // Date is rendered in the ledger's friendly format ("Apr 15, 2026").
    expect(await screen.findByText('Apr 15, 2026')).toBeInTheDocument();
  });

  it('shows the specific badge rank earned in the Type column', async () => {
    renderWithProviders(<RewardHistory />);
    // The mock returns a 7-day login reward (Deputy) and a 3-day play reward (Anted In).
    expect(await screen.findByText('Deputy')).toBeInTheDocument();
    expect(await screen.findByText('Anted In')).toBeInTheDocument();
  });
});
