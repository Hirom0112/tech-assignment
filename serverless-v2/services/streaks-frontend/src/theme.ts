import { createTheme, ThemeOptions } from '@mui/material/styles';

/**
 * Hijack brand: dark base (#0D1117) + single orange accent (#FF9800), green secondary.
 * Structured as a named map so additional themes can slot in later (future bonus),
 * but only this dark+orange brand ships now (CLAUDE.md §8 house style).
 */
const hijackDarkOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: { main: '#FF9800' },
    secondary: { main: '#4CAF50' },
    background: {
      default: '#0D1117',
      paper: '#161B22',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.5px' },
  },
  shape: { borderRadius: 10 },
};

export const themes = {
  'hijack-dark': createTheme(hijackDarkOptions),
} as const;

export type ThemeName = keyof typeof themes;

/** The active, shipped theme. */
export const theme = themes['hijack-dark'];
