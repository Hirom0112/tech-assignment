import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../test/renderWithProviders';
import { server } from '../test/mocks/server';
import ShareButton from '../components/ShareButton';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">' +
  '<text>HIJACK POKER</text></svg>';

describe('ShareButton (FR-9.2 share affordance)', () => {
  beforeEach(() => {
    // jsdom has no blob URL plumbing; provide it for the dialog <img> src.
    (URL.createObjectURL as unknown) = vi.fn(() => 'blob:mock-card');
    (URL.revokeObjectURL as unknown) = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a Share button', () => {
    renderWithProviders(<ShareButton />);
    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
  });

  it('fetches the share-card with the X-Player-Id header and previews it', async () => {
    let sentPlayerId: string | null = null;
    server.use(
      http.get(
        'http://localhost:5001/api/v1/player/streaks/share-card',
        ({ request }) => {
          sentPlayerId = request.headers.get('X-Player-Id');
          return new HttpResponse(SVG, {
            headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
          });
        }
      )
    );

    renderWithProviders(<ShareButton />);
    await userEvent.click(screen.getByRole('button', { name: /share/i }));

    // The on-brand card preview appears in the dialog.
    expect(
      await screen.findByAltText(/Hijack Poker streak card/i)
    ).toBeInTheDocument();
    await waitFor(() => expect(sentPlayerId).toBe('streak-001'));
  });

  it('shows an error message if the card cannot be generated', async () => {
    server.use(
      http.get(
        'http://localhost:5001/api/v1/player/streaks/share-card',
        () => new HttpResponse(null, { status: 500 })
      )
    );

    renderWithProviders(<ShareButton />);
    await userEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(
      await screen.findByText(/Could not generate your share card/i)
    ).toBeInTheDocument();
  });
});
