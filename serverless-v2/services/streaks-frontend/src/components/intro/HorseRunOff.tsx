import { useEffect, useRef, useState } from 'react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { Box } from '@mui/material';
import { TIMELINE } from './useSequencer';

/**
 * Beat 4 — the horse runs off into the distance (the EXIT).
 *
 * On tap, the gallop clip (horse-intro.mp4/.webm) plays AND the whole video
 * layer recedes toward the sun: scale 1 → ~0.35, drift up + slightly left
 * (toward the sun at the frame's left), opacity → 0, over ~EXIT_MS. The idle
 * still sits beneath so the recede reads as the rider shrinking into the scene.
 *
 * If the clip errors we still run the transform on the poster, so the exit
 * always reads even without video playback (e.g. jsdom / decode failure).
 */
export default function HorseRunOff({ active }: { active: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!active) return;
    const v = videoRef.current;
    if (!v) return;
    void v.play().catch(() => {
      /* decode/autoplay rejection — the recede transform still plays */
    });
  }, [active]);

  return (
    <LazyMotion features={domAnimation} strict>
      <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <m.div
          data-testid="intro-runoff"
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={
            active
              ? {
                  // Recede toward the sun (up + slightly left) while shrinking.
                  x: '-12%',
                  y: '-14%',
                  scale: 0.35,
                  opacity: 0,
                }
              : { x: 0, y: 0, scale: 1, opacity: 1 }
          }
          transition={{
            duration: TIMELINE.EXIT_MS / 1000,
            ease: [0.4, 0, 0.2, 1],
          }}
          style={{ position: 'absolute', inset: 0, transformOrigin: '22% 56%' }}
        >
          {!errored ? (
            <video
              ref={videoRef}
              poster="/assets/horse-intro-poster.jpg"
              muted
              playsInline
              onError={() => setErrored(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            >
              <source src="/assets/horse-intro.webm" type="video/webm" />
              <source src="/assets/horse-intro.mp4" type="video/mp4" />
            </video>
          ) : (
            <Box
              role="img"
              aria-label="Hijack Poker — horse galloping into the distance"
              sx={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'url(/assets/horse-intro-poster.jpg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          )}
        </m.div>
      </Box>
    </LazyMotion>
  );
}
