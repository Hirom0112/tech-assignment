import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import { store, setTheme } from '../store';
import { themes, DEFAULT_THEME } from '../theme';
import ThemeSwitcher from '../components/ThemeSwitcher';

/**
 * BL-2: switching to Option 2/3 changes the active theme (asserted via the
 * redux slice + the persisted localStorage value).
 */
function renderSwitcher() {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={themes[store.getState().theme.name]}>
        <ThemeSwitcher />
      </ThemeProvider>
    </Provider>
  );
}

describe('ThemeSwitcher (BL-2)', () => {
  beforeEach(() => {
    store.dispatch(setTheme(DEFAULT_THEME));
    localStorage.removeItem('themeName');
  });

  it('defaults to Option 1 (hijack-dark)', () => {
    renderSwitcher();
    expect(store.getState().theme.name).toBe('hijack-dark');
  });

  it('switching to Option 2 (Lounge) updates the slice and persists it', async () => {
    renderSwitcher();
    await userEvent.click(screen.getByRole('button', { name: /Lounge/i }));
    expect(store.getState().theme.name).toBe('hijack-lounge');
    expect(localStorage.getItem('themeName')).toBe('hijack-lounge');
  });

  it('switching to Option 3 (Neon) updates the slice and persists it', async () => {
    renderSwitcher();
    await userEvent.click(screen.getByRole('button', { name: /Neon/i }));
    expect(store.getState().theme.name).toBe('hijack-neon');
    expect(localStorage.getItem('themeName')).toBe('hijack-neon');
  });
});
