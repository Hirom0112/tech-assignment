import { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { streaksApi } from '../store/streaksApi';
import { theme, DEFAULT_THEME } from '../theme';

/**
 * A fresh store per test, including the real auth slice, the theme slice, and
 * the RTK Query api reducer/middleware. Wrapped in a MemoryRouter so components
 * that use react-router hooks (e.g. the dashboard's logout) render in tests.
 */
export function makeTestStore() {
  return configureStore({
    reducer: {
      auth: (state = { playerId: 'streak-001', isAuthenticated: true }) => state,
      theme: (state = { name: DEFAULT_THEME }) => state,
      [streaksApi.reducerPath]: streaksApi.reducer,
    },
    middleware: (gdm) => gdm().concat(streaksApi.middleware),
  });
}

export function renderWithProviders(ui: ReactElement) {
  const store = makeTestStore();
  return {
    store,
    ...render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <MemoryRouter>{ui}</MemoryRouter>
        </ThemeProvider>
      </Provider>
    ),
  };
}
