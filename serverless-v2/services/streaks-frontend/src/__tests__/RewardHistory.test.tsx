import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import RewardHistory from '../components/RewardHistory';

describe('RewardHistory (MSW-backed)', () => {
  it('lists each reward with milestone, type, date, and points from /rewards', async () => {
    renderWithProviders(<RewardHistory />);
    expect(await screen.findByText(/7-day login milestone/i)).toBeInTheDocument();
    expect(await screen.findByText(/3-day play milestone/i)).toBeInTheDocument();
    expect(await screen.findByText('+150')).toBeInTheDocument();
    expect(await screen.findByText('+100')).toBeInTheDocument();
    expect(await screen.findByText('2026-04-15')).toBeInTheDocument();
  });
});
