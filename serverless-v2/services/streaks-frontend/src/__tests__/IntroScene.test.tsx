import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import OpenSequence from '../components/intro/OpenSequence';
import { TIMELINE } from '../components/intro/useSequencer';
import { makeTestStore } from '../test/renderWithProviders';
import { theme } from '../theme';

/**
 * BL-1 (interactive redesign): the staged OpenSequence.
 *
 *   idle → logo → await(tap) → exit(run-off) → login
 *
 * The advance to login now happens on TAP, not on video end. jsdom can't play
 * <video>/<audio>, so we drive the auto-progression via fake timers and the
 * tap via click/keyboard.
 */
function renderSequence() {
  const store = makeTestStore();
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={['/intro']}>
          <Routes>
            <Route path="/intro" element={<OpenSequence />} />
            <Route path="/login" element={<div>LOGIN ROUTE</div>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </Provider>
  );
}

function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduce : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

/** Advance from idle → await (the auto-progression + prompt reveal). */
function advanceToAwait() {
  act(() => {
    // idle → logo
    vi.advanceTimersByTime(TIMELINE.IDLE_ENTER_MS + TIMELINE.IDLE_HOLD_MS + 20);
  });
  act(() => {
    // logo → await (prompt reveal)
    vi.advanceTimersByTime(TIMELINE.PROMPT_DELAY_MS + 20);
  });
}

describe('OpenSequence (interactive BL-1)', () => {
  beforeEach(() => {
    setReducedMotion(false);
    sessionStorage.clear();
    localStorage.removeItem('introSound');
    // jsdom has no real <video>/<audio> playback.
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  it('renders Skip and a sound toggle', () => {
    renderSequence();
    expect(screen.getByRole('button', { name: /Skip/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /intro sound/i })
    ).toBeInTheDocument();
  });

  it('starts on the static idle scene (no run-off video yet)', () => {
    renderSequence();
    expect(screen.getByTestId('intro-idle')).toBeInTheDocument();
    // No gallop <video> mounted at the open — the gallop is the EXIT.
    expect(document.querySelector('video')).toBeNull();
  });

  it('progresses idle → logo, then reveals the tap prompt and waits', () => {
    vi.useFakeTimers();
    try {
      renderSequence();
      act(() => {
        vi.advanceTimersByTime(TIMELINE.IDLE_ENTER_MS + TIMELINE.IDLE_HOLD_MS + 20);
      });
      // Logo on stage.
      expect(screen.getByTestId('intro-wordmark')).toBeInTheDocument();
      // Still no login (we wait for the tap).
      expect(screen.queryByText('LOGIN ROUTE')).toBeNull();
      // Prompt reveals after the chip settles.
      act(() => {
        vi.advanceTimersByTime(TIMELINE.PROMPT_DELAY_MS + 20);
      });
      expect(
        screen.getByRole('button', { name: /Tap to ride in/i })
      ).toBeInTheDocument();
      // Does NOT auto-advance: well past any old hold, still on the intro.
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByText('LOGIN ROUTE')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tapping (click) advances to /login via the run-off exit', () => {
    vi.useFakeTimers();
    try {
      renderSequence();
      advanceToAwait();
      const prompt = screen.getByRole('button', { name: /Tap to ride in/i });
      act(() => {
        prompt.click();
      });
      // Run-off exit, then navigate after EXIT_MS.
      act(() => {
        vi.advanceTimersByTime(TIMELINE.EXIT_MS + 50);
      });
      expect(screen.getByText('LOGIN ROUTE')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the safety timer advances to /login if the user never taps', () => {
    vi.useFakeTimers();
    try {
      renderSequence();
      advanceToAwait();
      act(() => {
        vi.advanceTimersByTime(TIMELINE.AWAIT_SAFETY_MS + TIMELINE.EXIT_MS + 50);
      });
      expect(screen.getByText('LOGIN ROUTE')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Skip jumps straight to /login', async () => {
    const user = userEvent.setup();
    renderSequence();
    await user.click(screen.getByRole('button', { name: /Skip/i }));
    expect(await screen.findByText('LOGIN ROUTE')).toBeInTheDocument();
  });

  it('reduced-motion renders the static end-state (no autoplay video), then a tap → login', () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    try {
      renderSequence();
      // Static lockup shows immediately, no idle/gallop <video> at open.
      expect(screen.getByTestId('intro-wordmark')).toBeInTheDocument();
      expect(document.querySelector('video')).toBeNull();
      // Prompt arms after a short hold; tap advances.
      act(() => {
        vi.advanceTimersByTime(TIMELINE.IDLE_HOLD_MS + 20);
      });
      const prompt = screen.getByRole('button', { name: /Tap to ride in/i });
      act(() => {
        prompt.click();
      });
      act(() => {
        vi.advanceTimersByTime(TIMELINE.EXIT_MS + 50);
      });
      expect(screen.getByText('LOGIN ROUTE')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sound toggle persists the preference to localStorage', async () => {
    const user = userEvent.setup();
    renderSequence();
    const toggle = screen.getByRole('button', { name: /intro sound/i });
    expect(localStorage.getItem('introSound')).not.toBe('on');
    await user.click(toggle);
    await waitFor(() => expect(localStorage.getItem('introSound')).toBe('on'));
    await user.click(toggle);
    await waitFor(() => expect(localStorage.getItem('introSound')).toBe('off'));
  });
});
