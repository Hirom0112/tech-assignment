import { createTheme, ThemeOptions } from '@mui/material/styles';
import type { Activity } from './types/streaks.types';

/**
 * Three selectable, visually-distinct themes (BL-2). Each is a real MUI theme
 * with its own palette/background/typography, so the WHOLE dashboard re-skins.
 *
 * Every theme also carries a `heatmap` palette under `theme.palette.heatmap`
 * (the 5 semantic heat-map states) so the calendar stays legible in each skin
 * instead of relying on one hardcoded set of colors.
 */

// --- module augmentation: a typed `heatmap` slot on the palette -------------
type HeatmapPalette = Record<Activity, string>;

declare module '@mui/material/styles' {
  interface Palette {
    heatmap: HeatmapPalette;
  }
  interface PaletteOptions {
    heatmap?: HeatmapPalette;
  }
}

// 1) hijack-dark — locked brand: dark #0D1117 + orange #FF9800. "Option 1".
const hijackDarkOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: { main: '#FF9800' },
    secondary: { main: '#4CAF50' },
    background: { default: '#0D1117', paper: '#161B22' },
    heatmap: {
      none: '#21262D',
      login_only: '#9BE9A8',
      played: '#2EA043',
      freeze: '#388BFD',
      broken: '#F85149',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.5px' },
  },
  shape: { borderRadius: 10 },
};

// 2) hijack-lounge — warm art-deco brass/parchment "saloon" (matches the art).
//    Deep wood/green-felt base, brass/gold accents, cream parchment surfaces.
const hijackLoungeOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: { main: '#C9A24B' }, // brass / gold
    secondary: { main: '#1F6F43' }, // green felt
    background: { default: '#231711', paper: '#3A2A1C' }, // deep wood / aged parchment-on-wood
    text: { primary: '#F3E6CC', secondary: '#C9B68F' },
    heatmap: {
      none: '#4A3522',
      login_only: '#D8C081',
      played: '#3FA968',
      freeze: '#6FB6D6',
      broken: '#D9544D',
    },
  },
  typography: {
    fontFamily: '"Georgia", "Times New Roman", serif',
    h4: { fontWeight: 800, letterSpacing: '0.5px' },
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: 8 },
};

// 3) hijack-neon — charcoal + high-contrast neon cyan/magenta. "Option 3".
const hijackNeonOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: { main: '#00E5FF' }, // neon cyan
    secondary: { main: '#FF2EC4' }, // neon magenta
    background: { default: '#0A0A12', paper: '#15151F' },
    text: { primary: '#E8F6FF', secondary: '#8AA0B5' },
    heatmap: {
      none: '#1C1C28',
      login_only: '#6CF0E0',
      played: '#00E5FF',
      freeze: '#7C4DFF',
      broken: '#FF2EC4',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 800, letterSpacing: '0.5px' },
  },
  shape: { borderRadius: 12 },
};

export const themes = {
  'hijack-dark': createTheme(hijackDarkOptions),
  'hijack-lounge': createTheme(hijackLoungeOptions),
  'hijack-neon': createTheme(hijackNeonOptions),
} as const;

export type ThemeName = keyof typeof themes;

/** Human labels for the switcher (Option 1/2/3). */
export const THEME_META: { name: ThemeName; label: string; short: string }[] = [
  { name: 'hijack-dark', label: 'Dark', short: '1' },
  { name: 'hijack-lounge', label: 'Lounge', short: '2' },
  { name: 'hijack-neon', label: 'Neon', short: '3' },
];

export const DEFAULT_THEME: ThemeName = 'hijack-dark';

/** The default brand theme (kept as a named export for tests/back-compat). */
export const theme = themes[DEFAULT_THEME];
