import { useEffect, useRef, useState } from 'react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { Box } from '@mui/material';
import { TIMELINE } from './useSequencer';

/**
 * Beats 1 + 4 — ONE horse-video layer for the whole sequence.
 *
 * During idle/logo/await it plays the gallop clip LOOPING, full-bleed
 * (autoPlay muted loop playsInline, object-fit: cover) — the horse gallops
 * continuously under the logo and the tap prompt. Muted autoplay is permitted
 * by browsers and the clip carries no audio track, so it plays on load.
 *
 * On `exiting` the SAME element gets the run-off recede transform
 * (scale 1→0.35 + drift up/left toward the sun + fade) — the horse keeps
 * galloping right up until it recedes off-screen. There is exactly one
 * <video> for the entire sequence (no second element is ever mounted).
 *
 * Reduced-motion: no autoplay video — render the static poster still instead.
 * If the video errors, fall back to the poster (the recede still applies).
 *
 * SWAP: a dedicated "horse runs off receding" clip could replace the reused
 * gallop + CSS recede for a purpose-shot exit.
 */
export default function HorseGallop({
  exiting,
  motionless = false,
}: {
  /** The run-off exit is underway — apply the recede transform. */
  exiting: boolean;
  /** Reduced-motion: render the static poster, no autoplay video. */
  motionless?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errored, setErrored] = useState(false);

  // Best-effort autoplay kick (some engines defer autoplay until play()).
  useEffect(() => {
    if (motionless) return;
    const v = videoRef.current;
    if (!v) return;
    void v.play().catch(() => {
      /* autoplay deferred — poster covers the gap; loop resumes on gesture */
    });
  }, [motionless]);

  const showPoster = motionless || errored;

  return (
    <LazyMotion features={domAnimation} strict>
      <Box sx={{ position: 'absolute', inset: 0, bgcolor: '#0E0805', overflow: 'hidden' }}>
        <m.div
          data-testid="intro-horse"
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={
            exiting
              ? { x: '-12%', y: '-14%', scale: 0.35, opacity: 0 }
              : { x: 0, y: 0, scale: 1, opacity: 1 }
          }
          transition={{ duration: TIMELINE.EXIT_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
          style={{ position: 'absolute', inset: 0, transformOrigin: '22% 56%' }}
        >
          {!showPoster ? (
            <video
              ref={videoRef}
              data-testid="intro-horse-video"
              poster="/assets/horse-intro-poster.jpg"
              autoPlay
              muted
              loop
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
              aria-label="Hijack Poker — horse galloping toward the sunset"
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

        {/* Gentle warm sun-glow pulse over the gallop (left third = the sun). */}
        {!motionless && !exiting && (
          <m.div
            aria-hidden
            initial={false}
            animate={{ opacity: [0.0, 0.14, 0.0] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(36% 48% at 16% 52%, rgba(255,214,140,0.85) 0%, transparent 70%)',
              mixBlendMode: 'screen',
              pointerEvents: 'none',
            }}
          />
        )}
      </Box>
    </LazyMotion>
  );
}
