import { LazyMotion, domAnimation, m } from 'framer-motion';
import { Box } from '@mui/material';

/**
 * Beat 1 — the static standing-horse sunset, brought to life.
 *
 *   entrance : fade + scale-in (the scene materializes)
 *   "jump"   : a quick spring bob (translateY/scale overshoot) so the still
 *              springs to life — reads as a whole-scene bob, not an isolated
 *              horse jump, because the idle is a single flat image.
 *   ambient  : a gentle infinite pulse (scale 1.0↔1.02) keeps it alive while
 *              the logo reveals over it; a soft warm sun-glow pulses in sync.
 *
 * SWAP: when a layered standing-horse asset (separate horse + a real
 * horse-jump sprite/clip) exists, replace this single <img> + scene-bob with
 * an isolated-horse jump so the "comes alive / jumps up" reads literally.
 */
const BOB_KEYS = { y: [0, -26, 4, -6, 0], scale: [1, 1.035, 0.995, 1.008, 1] };

export default function IdleScene({
  active,
  motionless = false,
}: {
  /** The idle beat is on-stage. */
  active: boolean;
  /** Reduced-motion: render the still with no bob/pulse. */
  motionless?: boolean;
}) {
  return (
    <LazyMotion features={domAnimation} strict>
      <Box sx={{ position: 'absolute', inset: 0, bgcolor: '#0E0805', overflow: 'hidden' }}>
        {/* The standing-horse still. SWAP: layered/jumping horse asset. */}
        <m.div
          data-testid="intro-idle"
          initial={motionless ? false : { opacity: 0, scale: 1.06 }}
          animate={
            active && !motionless
              ? {
                  opacity: 1,
                  // entrance scale-in → spring "jump" bob → settle to pulse
                  y: BOB_KEYS.y,
                  scale: BOB_KEYS.scale,
                }
              : { opacity: 1, y: 0, scale: 1 }
          }
          transition={
            motionless
              ? { duration: 0 }
              : {
                  opacity: { duration: 0.45, ease: 'easeOut' },
                  y: { duration: 0.85, delay: 0.45, ease: 'easeOut' },
                  scale: { duration: 0.85, delay: 0.45, ease: 'easeOut' },
                }
          }
          style={{ position: 'absolute', inset: 0 }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'url(/assets/horse-idle.jpg)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        </m.div>

        {/* Ambient scene pulse (kept subtle) layered as a vignette breath. */}
        {!motionless && (
          <m.div
            aria-hidden
            initial={false}
            animate={{ opacity: [0.0, 0.16, 0.0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 1.3 }}
            style={{
              position: 'absolute',
              inset: 0,
              // Warm glow centered on the sun (left third of the frame).
              background:
                'radial-gradient(38% 50% at 18% 56%, rgba(255,214,140,0.9) 0%, transparent 70%)',
              mixBlendMode: 'screen',
              pointerEvents: 'none',
            }}
          />
        )}
      </Box>
    </LazyMotion>
  );
}
