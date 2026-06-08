import type { Transform } from './EditorContext';

/**
 * Bump this whenever the baked layout changes so saved editor overrides from an
 * older version are discarded (otherwise a stale localStorage would mask the new
 * layout). The header below is always re-applied, so bumping never shrinks it.
 */
export const LAYOUT_VERSION = 3;

/**
 * Baked transforms applied by default (edit mode or not).
 *
 * As of v3 only the HEADER is baked (the user's sizing — kept untouched). The
 * CARDS are intentionally NOT here so they flow in the responsive grid instead
 * of being pinned to viewport pixels (which clipped on other screen sizes). You
 * can still nudge any card in the editor; those local edits layer on top.
 */
export const DEFAULT_LAYOUT: Record<string, Transform> = {
  shield: { x: -62.25, y: -8.96, rot: 0, sx: 2.04, sy: 1.86 },
  logo: { x: 73.01, y: -12.01, rot: 0, sx: 3, sy: 2.42 },
  'btn-checkin': { x: -172.54, y: -2.19, rot: 0, sx: 1.96, sy: 1.7 },
  'btn-share': { x: -77.32, y: -2.24, rot: 0, sx: 1.6, sy: 1.7 },
  'btn-logout': { x: -43.67, y: -0.32, rot: 0, sx: 1.6, sy: 1.7 },
};
