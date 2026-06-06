import { useEffect, useRef, useState } from 'react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { Box } from '@mui/material';
import { TIMELINE } from './useSequencer';

/**
 * Beats 1 + 4 — ONE horse-video layer for the whole sequence.
 *
 * This footage is a "gallop-in-and-arrive" shot (the horse travels across and
 * decelerates to the standing sunset pose), so it CANNOT loop seamlessly —
 * looping teleports the horse back to the start. Instead it plays ONCE:
 *
 *   Beat 1  the horse gallops in, arrives, and HOLDS on the last frame
 *           (a non-looping <video> freezes its final frame; we keep it mounted)
 *   Beat 4  on `exiting`, REPLAY the same element (currentTime = 0 + play())
 *           so the horse gallops again, while the recede transform carries it
 *           off into the distance (scale 1→0.35 + drift up/left + fade).
 *
 * Net: the horse visibly gallops on ENTRY and on EXIT, and stands (holds) during
 * the logo reveal + tap-wait. Exactly one <video> for the entire sequence.
 *
 * Reduced-motion: no autoplay video — render the static poster still instead.
 * If the video errors, fall back to the poster (the recede still applies).
 *
 * SWAP: a seamless in-place gallop-loop clip would let the horse gallop
 * continuously the whole time; this travel-and-arrive shot can't provide that.
 */
export default function HorseGallop({
  exiting,
  motionless = false,
}: {
  /** The run-off exit is underway — replay + apply the recede transform. */
  exiting: boolean;
  /** Reduced-motion: render the static poster, no autoplay video. */
  motionless?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errored, setErrored] = useState(false);

  // Entry: best-effort autoplay kick (some engines defer autoplay until play()).
  useEffect(() => {
    if (motionless) return;
    const v = videoRef.current;
    if (!v) return;
    void v.play().catch(() => {
      /* autoplay deferred — poster covers the gap; entry resumes on gesture */
    });
  }, [motionless]);

  // Exit: replay the SAME element so the horse gallops off as it recedes.
  useEffect(() => {
    if (!exiting || motionless) return;
    const v = videoRef.current;
    if (!v) return;
    try {
      v.currentTime = 0;
    } catch {
      /* not yet seekable — play() from wherever it's held is still fine */
    }
    void v.play().catch(() => {});
  }, [exiting, motionless]);

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

        {/* Gentle warm sun-glow pulse over the scene (left third = the sun). */}
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
