import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import FreezeStatus from '../components/FreezeStatus';

describe('FreezeStatus (MSW-backed)', () => {
  it('shows the freeze count and last-used history from /freezes', async () => {
    renderWithProviders(<FreezeStatus />);
    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(await screen.findByText(/Used this month: 1/)).toBeInTheDocument();
    expect(await screen.findByText('2026-04-04')).toBeInTheDocument();
    expect(await screen.findByText(/free monthly/)).toBeInTheDocument();
  });

  it('shows a "freeze active today" chip when today is a freeze day', async () => {
    renderWithProviders(<FreezeStatus todayActivity="freeze" />);
    expect(await screen.findByText(/Freeze active today/i)).toBeInTheDocument();
  });

  it('does not show the active chip on a non-freeze day', async () => {
    renderWithProviders(<FreezeStatus todayActivity="played" />);
    await screen.findByText('2');
    expect(screen.queryByText(/Freeze active today/i)).not.toBeInTheDocument();
  });
});
