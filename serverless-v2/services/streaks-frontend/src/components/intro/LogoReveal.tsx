import { useEffect } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { Box } from '@mui/material';
import { TIMELINE } from './useSequencer';

/**
 * Beat 2 — the logo reveal, layered OVER the idle scene (transparent bed).
 *
 * Wordmark "HIJACK POKER" fades + rises in, then the black HJ chip flies in
 * from the right doing a pseudo-3D rotateY coin-flip and springs onto its mark
 * with a specular highlight sweep. After the chip settles the host flips
 * `awaitingTap`, which reveals a pulsing "Tap to ride in" prompt — the flow
 * then WAITS for input. On `exiting` the whole lockup dissolves (the run-off
 * carries the eye away beneath it).
 *
 * Framer Motion is loaded via LazyMotion + domAnimation + the `m` component so
 * it never enters the dashboard bundle (the whole intro is lazy-split).
 *
 * Choreography (all GPU-composited transform/opacity):
 *   wordmark  opacity 0→1, y 28→0, blur 8→0   | 700ms expo-out, +150ms delay
 *   chip      x 420→0  (expo-out 900ms)
 *             rotateY 540→0 (quint-out 1050ms) — 1.5 turns, decelerating
 *             scale spring (stiffness 260 / damping 14) — overshoot & settle
 *             rotateZ 0→3→0 wobble on the drop
 *   sweep     a diagonal specular gleam crosses "HJ" right after the settle
 *   prompt    pulsing "Tap to ride in →" once awaitingTap is set
 *
 * `static` renders the settled end-state with no motion (reduced-motion).
 */
const EXPO_OUT = [0.16, 1, 0.3, 1] as const;
const QUINT_OUT = [0.22, 1, 0.36, 1] as const;

export default function LogoReveal({
  active,
  static: isStatic = false,
  awaitingTap = false,
  exiting = false,
  onChipSettled,
  onTap,
}: {
  /** Beat 2 is on-stage — start the enter animations. */
  active: boolean;
  /** Render the settled end-state with no animation. */
  static?: boolean;
  /** Show the pulsing tap prompt and wait for input. */
  awaitingTap?: boolean;
  /** The run-off exit is underway — dissolve the lockup. */
  exiting?: boolean;
  onChipSettled?: () => void;
  /** Tap/click on the lockup → advance (host wires the same to the prompt). */
  onTap?: () => void;
}) {
  const reduce = useReducedMotion();
  const motionless = isStatic || reduce;

  // Fire the settle callback once the chip would have landed.
  useEffect(() => {
    if (!active || motionless) return;
    const id = window.setTimeout(
      () => onChipSettled?.(),
      TIMELINE.CHIP_SETTLE_AT_MS
    );
    return () => window.clearTimeout(id);
  }, [active, motionless, onChipSettled]);

  // Static path: chip already settled — fire once on mount.
  useEffect(() => {
    if (active && motionless) onChipSettled?.();
  }, [active, motionless, onChipSettled]);

  const animateIn = active && !motionless;

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        // The whole lockup dissolves during the run-off exit.
        animate={{ opacity: exiting ? 0 : 1 }}
        transition={{ duration: exiting ? TIMELINE.EXIT_TO_LOGIN_MS / 1000 : 0.3, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Box
          onClick={awaitingTap ? onTap : undefined}
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: awaitingTap ? 'pointer' : 'default',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: { xs: 4, md: 8 },
            }}
          >
            {/* ---- Wordmark (SWAP: final wordmark SVG) ------------------ */}
            <m.div
              initial={motionless ? false : { opacity: 0, y: 28, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{
                duration: 0.7,
                ease: EXPO_OUT,
                delay: TIMELINE.WORDMARK_DELAY_MS / 1000,
              }}
              style={{ textAlign: 'center', userSelect: 'none' }}
              data-testid="intro-wordmark"
            >
              <Box
                sx={{
                  fontFamily: '"Rye", Georgia, serif',
                  fontSize: { xs: 56, md: 96 },
                  lineHeight: 1,
                  letterSpacing: 2,
                  background:
                    'linear-gradient(180deg, #F1D98C 0%, #D9A441 55%, #9C6B22 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textShadow: '0 3px 6px rgba(0,0,0,0.45)',
                  filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))',
                }}
              >
                HIJACK
              </Box>
              <Box
                sx={{
                  mt: 1,
                  fontFamily: '"Smokum", "Rye", Georgia, serif',
                  fontSize: { xs: 22, md: 34 },
                  letterSpacing: 10,
                  color: '#E8C778',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1.5,
                  textShadow: '0 2px 3px rgba(0,0,0,0.5)',
                }}
              >
                <span aria-hidden>◄</span>
                POKER
                <span aria-hidden>►</span>
              </Box>
            </m.div>

            {/* ---- Chip (perspective parent + rotateY coin-flip) ------- */}
            <Box
              sx={{
                perspective: '1200px',
                width: { xs: 150, md: 230 },
                height: { xs: 150, md: 230 },
                flexShrink: 0,
              }}
            >
              <m.div
                style={{
                  width: '100%',
                  height: '100%',
                  transformStyle: 'preserve-3d',
                  position: 'relative',
                }}
                initial={motionless ? false : { x: 420, rotateY: 540, scale: 0.6, opacity: 0 }}
                animate={
                  animateIn
                    ? { x: 0, rotateY: 0, scale: 1, opacity: 1, rotateZ: [0, 3, 0] }
                    : { x: 0, rotateY: 0, scale: 1, opacity: 1 }
                }
                transition={{
                  x: { duration: 0.9, ease: EXPO_OUT, delay: TIMELINE.CHIP_DELAY_MS / 1000 },
                  rotateY: { duration: 1.05, ease: QUINT_OUT, delay: TIMELINE.CHIP_DELAY_MS / 1000 },
                  opacity: { duration: 0.4, delay: TIMELINE.CHIP_DELAY_MS / 1000 },
                  scale: {
                    type: 'spring',
                    stiffness: 260,
                    damping: 14,
                    restDelta: 0.001,
                    delay: TIMELINE.CHIP_DELAY_MS / 1000,
                  },
                  rotateZ: {
                    duration: 0.18,
                    ease: 'easeOut',
                    delay: (TIMELINE.CHIP_SETTLE_AT_MS - 120) / 1000,
                  },
                }}
              >
                {/* SWAP: final chip asset here (PNG / SVG / spin sprite sheet). */}
                <Box
                  component="img"
                  src="/assets/chip-hj.svg"
                  alt="Hijack Poker HJ chip"
                  draggable={false}
                  sx={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    filter: 'drop-shadow(0 14px 22px rgba(0,0,0,0.55))',
                    backfaceVisibility: 'hidden',
                  }}
                />

                {/* Specular gleam sweeping across the chip just after settle. */}
                <m.div
                  aria-hidden
                  initial={motionless ? false : { x: '-140%', opacity: 0 }}
                  animate={
                    animateIn ? { x: '140%', opacity: [0, 0.9, 0] } : { x: '140%', opacity: 0 }
                  }
                  transition={{
                    duration: 0.55,
                    ease: 'easeInOut',
                    delay: TIMELINE.CHIP_SETTLE_AT_MS / 1000,
                  }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background:
                      'linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.55) 50%, transparent 62%)',
                    mixBlendMode: 'screen',
                    pointerEvents: 'none',
                  }}
                />
              </m.div>
            </Box>
          </Box>

          {/* ---- Tap prompt (Beat 3) — pulses while we wait for input. -- */}
          <m.div
            data-testid="intro-tap-prompt"
            initial={{ opacity: 0, y: 12 }}
            animate={
              awaitingTap && !exiting
                ? { opacity: [0.55, 1, 0.55], y: 0 }
                : { opacity: 0, y: 12 }
            }
            transition={
              awaitingTap && !exiting
                ? { opacity: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }, y: { duration: 0.4 } }
                : { duration: 0.3 }
            }
            style={{
              position: 'absolute',
              bottom: '12%',
              pointerEvents: awaitingTap ? 'auto' : 'none',
              userSelect: 'none',
            }}
          >
            <Box
              role={awaitingTap ? 'button' : undefined}
              tabIndex={awaitingTap ? 0 : -1}
              aria-label="Tap to ride in"
              onClick={awaitingTap ? onTap : undefined}
              sx={{
                px: 3,
                py: 1,
                fontFamily: '"Smokum", "Rye", Georgia, serif',
                fontSize: { xs: 16, md: 20 },
                letterSpacing: 4,
                color: '#F3E6CC',
                textTransform: 'uppercase',
                border: '1px solid rgba(243,230,204,0.55)',
                borderRadius: 999,
                backdropFilter: 'blur(3px)',
                background: 'rgba(0,0,0,0.22)',
                cursor: 'pointer',
                textShadow: '0 2px 3px rgba(0,0,0,0.6)',
              }}
            >
              Tap to ride in &nbsp;→
            </Box>
          </m.div>
        </Box>
      </m.div>
    </LazyMotion>
  );
}
