import { createTheme, ThemeOptions } from '@mui/material/styles';
import type { Activity } from './types/streaks.types';

/**
 * Single brand theme: **Hijack Tavern** — a warm wood-and-brass poker-parlor
 * skin (matches the tavern dashboard concept art). Deep wood base, brass/gold
 * frames, cream parchment text, an amber/orange energy accent.
 *
 * NOTE (stub decision, 2026-06-07): the previous 3-way theme switcher
 * (hijack-dark / hijack-lounge / hijack-neon, "BL-2") was removed in favour of
 * this one committed look. The switcher + the other two themes live in git
 * history (see the handoff) and can be revived if we decide to ship selectable
 * themes later. The `themes` map is kept as a map of one so re-adding entries
 * (and the ThemeSwitcher) is a small, localized change.
 *
 * Every theme carries a `heatmap` palette under `theme.palette.heatmap` (the 5
 * semantic calendar states) so the heat-map stays legible in the skin.
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

// hijack-tavern — warm wood / brass "High Roller's Lounge" parlor.
//   default  = the dark wood plank backdrop (also the browser/page background)
//   paper    = the burnished leather panel fill
//   primary  = amber/orange energy accent (buttons, big numerals, fire motif)
//   secondary= brass / gold (frames, labels, milestone fills)
const hijackTavernOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: { main: '#E08A3C' }, // amber / orange accent
    secondary: { main: '#C9A24B' }, // brass / gold
    background: { default: '#2E1D10', paper: '#3D2817' }, // dark wood / burnished leather
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
    // Body stays a clean serif; headings use the engraved display serif (Cinzel,
    // loaded in index.html) for the tavern signage feel.
    fontFamily: '"Spectral", "Georgia", "Times New Roman", serif',
    h4: { fontFamily: '"Cinzel", "Georgia", serif', fontWeight: 700, letterSpacing: '0.5px' },
    h5: { fontFamily: '"Cinzel", "Georgia", serif', fontWeight: 700 },
    h6: { fontFamily: '"Cinzel", "Georgia", serif', fontWeight: 700 },
  },
  shape: { borderRadius: 8 },
  components: {
    // The wood-table backdrop is pinned to the VIEWPORT (fixed), so it fills the
    // screen at every scroll position — the page content scrolls over a steady
    // table instead of the image scrolling away and leaving gaps top/bottom.
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#2E1D10',
          backgroundImage: 'url(/assets/dashboard/bg/bg-wood.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        },
      },
    },
  },
};

export const themes = {
  'hijack-tavern': createTheme(hijackTavernOptions),
} as const;

export type ThemeName = keyof typeof themes;

export const DEFAULT_THEME: ThemeName = 'hijack-tavern';

/** The default brand theme (kept as a named export for tests/back-compat). */
export const theme = themes[DEFAULT_THEME];
