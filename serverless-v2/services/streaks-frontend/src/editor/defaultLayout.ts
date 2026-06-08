import type { Transform } from './EditorContext';

/**
 * The baked layout — the user's redesign captured from the visual editor. These
 * per-asset transforms are applied by default (edit mode or not), so the page
 * renders exactly as arranged. Re-export from the editor with "Copy layout" and
 * paste here to update. (Positions are in px, tuned for a ~desktop viewport.)
 */
export const DEFAULT_LAYOUT: Record<string, Transform> = {
  shield: { x: -62.25, y: -8.96, rot: 0, sx: 2.04, sy: 1.86 },
  logo: { x: 73.01, y: -11.88, rot: 0, sx: 2.88, sy: 2.32 },
  brazier: { x: 11.02, y: -0.12, rot: 0, sx: 0.96, sy: 1 },
  'card-flame': { x: -174.47, y: 4.41, rot: 0, sx: 1.3, sy: 1.1 },
  'card-cards': { x: -94.1, y: 3.76, rot: 0, sx: 1.3, sy: 1.1 },
  ace: { x: -0.29, y: 33.35, rot: 0, sx: 0.8, sy: 1.06 },
  'card-milestone': { x: 11.18, y: 2.14, rot: 0, sx: 1.24, sy: 1.1 },
  'card-calendar': { x: -169.99, y: 16.08, rot: 0, sx: 1.1, sy: 1.02 },
  'card-rewards': { x: -52.39, y: 19.65, rot: 0, sx: 1.16, sy: 1.02 },
  'card-freezes': { x: -19.46, y: -149.64, rot: 0, sx: 1.52, sy: 1.3 },
  'card-personalbest': { x: -21.59, y: 460.23, rot: 0, sx: 1.52, sy: 1.44 },
  'btn-checkin': { x: -106.43, y: -2.69, rot: 0, sx: 1.5, sy: 1.6 },
  'btn-share': { x: -42.46, y: -2.92, rot: 0, sx: 1.5, sy: 1.6 },
  'btn-logout': { x: -1.88, y: -2.94, rot: 0, sx: 1.5, sy: 1.6 },
};
