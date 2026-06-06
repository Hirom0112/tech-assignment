import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { store } from '../store';
import { themes } from '../theme';
import LoginScreen from '../components/LoginScreen';

/**
 * BL-1 acceptance test: the art-deco login renders Sign In / Sign Up, and a
 * Sign In dispatches login(chosen id) + routes to the dashboard. Wrapped with
 * the REAL <Provider> (so the auth/theme slices exist) + a MemoryRouter.
 */
function renderLogin() {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={themes['hijack-dark']}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/" element={<div>DASHBOARD ROUTE</div>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </Provider>
  );
}

describe('LoginScreen (BL-1, real Provider + router)', () => {
  it('renders the hero plaque and Sign In / Sign Up affordances', () => {
    renderLogin();
    // The wordmark/footer are embossed into the plaque art (no HIJACK text node).
    expect(
      screen.getByRole('img', { name: /High Roller's Lounge/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Sign In/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Sign Up/i })
    ).toBeInTheDocument();
  });

  it('does NOT render the theme switcher (login is the fixed brand scene)', () => {
    renderLogin();
    expect(screen.queryByRole('button', { name: /theme/i })).toBeNull();
    expect(screen.queryByText(/Dark|Lounge|Neon/)).toBeNull();
  });

  it('Sign In dispatches login(chosen id) and routes to the dashboard', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));

    // auth state reflects the chosen (default) seeded id...
    expect(store.getState().auth.playerId).toBe('streak-001');
    expect(store.getState().auth.isAuthenticated).toBe(true);
    // ...and we navigated to the dashboard route.
    expect(await screen.findByText('DASHBOARD ROUTE')).toBeInTheDocument();
  });

  it('Sign Up generates a fresh player- id, logs in, and routes', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /Sign Up/i }));

    expect(store.getState().auth.playerId).toMatch(/^player-[a-z0-9]+$/);
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(await screen.findByText('DASHBOARD ROUTE')).toBeInTheDocument();
  });
});
