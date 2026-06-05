import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The interactive staged app-open state machine (redesign BL-1++).
 *
 *   idle → logo → await → exit → (done)
 *
 * - `idle`  : Beat 1, the STATIC standing-horse image. Fades/scales in, the
 *             scene "jumps up" (spring bob), then an ambient pulse loop.
 * - `logo`  : Beat 2, the wordmark rises + the HJ chip coin-flips & settles,
 *             layered OVER the still idle scene.
 * - `await` : Beat 3, a pulsing "Tap to ride in" prompt. The sequence WAITS
 *             for user input here (no auto-advance) — a long safety timer is the
 *             only thing that can advance it unattended.
 * - `exit`  : Beat 4, on tap the gallop clip plays and the horse RECEDES into
 *             the distance (scale↓ + drift toward the sun + fade) while the
 *             wordmark/chip/prompt dissolve; then we crossfade to login.
 * - `done`  : the exit crossfade finished; the host navigates to /login.
 *
 * The hook owns timing + interaction wiring only — it does not render.
 */
export type Phase = 'idle' | 'logo' | 'await' | 'exit' | 'done';

/** Beat-by-beat timeline (ms). Exported so tests/docs reference one source. */
export const TIMELINE = {
  /** Idle entrance settle (fade/scale-in) before the "jump" bob. */
  IDLE_ENTER_MS: 450,
  /** Idle holds (bob + pulse) before the logo reveals over it. */
  IDLE_HOLD_MS: 1200,
  /** Wordmark enters this long after the logo beat starts. */
  WORDMARK_DELAY_MS: 150,
  /** Chip launches this long after the logo beat starts (just after wordmark). */
  CHIP_DELAY_MS: 300,
  /** Chip travel + rotateY + spring settle window. */
  CHIP_SETTLE_AT_MS: 1350,
  /** After the chip settles, reveal the tap prompt and enter `await`. */
  PROMPT_DELAY_MS: 1650,
  /** Safety auto-advance from `await` so the flow can never truly hang. */
  AWAIT_SAFETY_MS: 12000,
  /** Horse run-off recede + scene dissolve before the login crossfade. */
  EXIT_MS: 1200,
  /** Final crossfade into the login screen (overlaps the tail of EXIT). */
  EXIT_TO_LOGIN_MS: 600,
} as const;

/** prefers-reduced-motion: skip the cinematic, show a brief static end-state. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const INTRO_SEEN_KEY = 'introSeen';

/** Returning-user bypass: once seen this session, don't replay the cinematic. */
export function introAlreadySeen(): boolean {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
export function markIntroSeen(): void {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export interface Sequencer {
  phase: Phase;
  reducedMotion: boolean;
  /** Beat 2 is on-stage — drives wordmark/chip enter animations. */
  logoActive: boolean;
  /** The tap prompt is visible and we're waiting for input. */
  awaitingTap: boolean;
  /** The horse run-off / exit is underway. */
  exiting: boolean;
  /** User tapped/clicked/keyed during `await` → start the run-off exit. */
  tap: () => void;
  /** Jump straight to login (Skip / Esc) — no run-off animation. */
  skip: () => void;
  /** Signals the chip has reached its mark (for the settle SFX). */
  onChipSettled: () => void;
  /** Subscribe to the chip-settle moment (audio). Returns an unsubscribe. */
  onSettle: (cb: () => void) => () => void;
}

export function useSequencer(options?: {
  /** Test seam: force the reduced-motion static path. */
  forceReducedMotion?: boolean;
  /** Called once when the sequence is fully done (host navigates). */
  onDone?: () => void;
}): Sequencer {
  const reducedMotion = options?.forceReducedMotion ?? prefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(reducedMotion ? 'logo' : 'idle');
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const settleSubs = useRef<Set<() => void>>(new Set());
  const timers = useRef<number[]>([]);
  const onDoneRef = useRef(options?.onDone);
  onDoneRef.current = options?.onDone;

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  /** Beat 4 → done: run the exit, then navigate. */
  const startExit = useCallback(() => {
    if (phaseRef.current === 'exit' || phaseRef.current === 'done') return;
    setPhase('exit');
    after(TIMELINE.EXIT_MS, () => {
      setPhase('done');
      markIntroSeen();
      onDoneRef.current?.();
    });
  }, [after]);

  /** Beat 3: reveal the tap prompt; arm the safety auto-advance. */
  const enterAwait = useCallback(() => {
    if (phaseRef.current !== 'logo') return;
    setPhase('await');
    after(TIMELINE.AWAIT_SAFETY_MS, () => {
      if (phaseRef.current === 'await') startExit();
    });
  }, [after, startExit]);

  /** Beat 1 → Beat 2: reveal the logo over the idle scene. */
  const enterLogo = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    setPhase('logo');
    // After the chip settles + a beat, surface the tap prompt.
    after(TIMELINE.PROMPT_DELAY_MS, enterAwait);
  }, [after, enterAwait]);

  /** User input during `await` → start the run-off exit. */
  const tap = useCallback(() => {
    if (phaseRef.current !== 'await') return;
    startExit();
  }, [startExit]);

  /** Skip / Esc → straight to login, no run-off. */
  const skip = useCallback(() => {
    clearTimers();
    setPhase('done');
    markIntroSeen();
    onDoneRef.current?.();
  }, [clearTimers]);

  const onChipSettled = useCallback(() => {
    settleSubs.current.forEach((cb) => cb());
  }, []);

  const onSettle = useCallback((cb: () => void) => {
    settleSubs.current.add(cb);
    return () => {
      settleSubs.current.delete(cb);
    };
  }, []);

  // Drive the auto-progression idle → logo → (await waits for input).
  // Reduced-motion starts at `logo` and likewise advances to `await`, but the
  // OpenSequence renders it as a static end-state (no animation) and the user
  // still taps (or the safety timer fires) to reach login.
  useEffect(() => {
    if (reducedMotion) {
      // Static end-state already at `logo`; arm await after a short hold.
      const id = window.setTimeout(enterAwait, TIMELINE.IDLE_HOLD_MS);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(
      enterLogo,
      TIMELINE.IDLE_ENTER_MS + TIMELINE.IDLE_HOLD_MS
    );
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // Cleanup on unmount.
  useEffect(() => clearTimers, [clearTimers]);

  return {
    phase,
    reducedMotion,
    logoActive: phase !== 'idle',
    awaitingTap: phase === 'await',
    exiting: phase === 'exit' || phase === 'done',
    tap,
    skip,
    onChipSettled,
    onSettle,
  };
}
