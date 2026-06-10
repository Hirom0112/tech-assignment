import { useCallback, useEffect, useRef, useState } from 'react';
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
 * Blocked autoplay (Safari/iOS): muting + playsInline satisfies the *normal*
 * autoplay gate, but Low Power Mode, macOS-on-battery, and a per-site
 * "Never Auto-Play" setting disable autoplay UNCONDITIONALLY and WebKit paints
 * its own gray center play-button over the <video> (WONTFIX; can't be styled
 * away). We can't force playback in those states — so we DETECT the block
 * (a `NotAllowedError` from play(), or `getAutoplayPolicy()` reporting
 * "disallowed" up front) and swap the live <video> for the poster still, so the
 * user sees our art instead of WebKit's stuck play glyph. A transient interrupt
 * (`AbortError`, e.g. a StrictMode remount) is NOT a block — those keep retrying.
 *
 * SWAP: a seamless in-place gallop-loop clip would let the horse gallop
 * continuously the whole time; this travel-and-arrive shot can't provide that.
 */

/** WebKit/Chromium autoplay-policy probe (not yet in the TS DOM lib). */
type AutoplayPolicy = 'allowed' | 'allowed-muted' | 'disallowed';
function autoplayDisallowed(media: HTMLMediaElement): boolean {
  const get = (navigator as Navigator & {
    getAutoplayPolicy?: (ctx: 'mediaelement' | HTMLMediaElement) => AutoplayPolicy;
  }).getAutoplayPolicy;
  // Only a hard "disallowed" means even muted autoplay is blocked; a muted clip
  // under "allowed-muted" plays fine, so don't pre-empt those.
  return typeof get === 'function' && get(media) === 'disallowed';
}
export default function HorseGallop({
  exiting,
  motionless = false,
}: {
  /** The run-off exit is underway — replay + apply the recede transform. */
  exiting: boolean;
  /** Reduced-motion: render the static poster, no autoplay video. */
  motionless?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errored, setErrored] = useState(false);
  // Autoplay was hard-blocked by the browser policy (Low Power Mode / battery /
  // "Never Auto-Play"). Distinct from `errored` (decode/network failure) and
  // `motionless` (reduced-motion); all three resolve to the poster fallback.
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Callback ref: set `muted` the INSTANT the <video> node mounts, before
  // Safari evaluates its autoplay gate. React's JSX `muted` attribute is applied
  // too late (known React bug), so Safari sees the video as "has sound" and
  // blocks muted autoplay — leaving the horse frozen on the poster. Setting the
  // property here (commit phase) is what actually unblocks Safari autoplay.
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el) {
      el.muted = true;
      el.defaultMuted = true;
      el.playsInline = true;
    }
  }, []);

  // Entry autoplay — deterministic, race-free.
  //
  // The old version fired play() from several places and swallowed every
  // rejection, so a play() interrupted by a StrictMode re-mount, a not-yet-ready
  // decoder, or a competing play() call would silently never recover — giving
  // "sometimes plays / sometimes delayed / sometimes not at all".
  //
  // Instead, ONE idempotent `tryPlay`: it no-ops if the video is already playing
  // (so overlapping calls can't interrupt each other), bails after the effect is
  // torn down (`cancelled`, so a StrictMode unmount can't leave a stale play()
  // racing the remount), and is (re)invoked whenever the media becomes ready
  // (`canplay`/`loadeddata`) or on the first user gesture (covers an autoplay
  // policy block, e.g. Low Power Mode). `muted`/`playsInline` are already set in
  // the ref callback before the browser's autoplay gate.
  useEffect(() => {
    if (motionless) return;
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;

    // Up-front probe: if the policy already says "disallowed", don't even attempt
    // play() — go straight to the poster so the <video> (and WebKit's overlay)
    // never paints. Where unsupported this is a no-op and we fall through to the
    // play()/catch path below.
    if (autoplayDisallowed(v)) {
      setAutoplayBlocked(true);
      return;
    }

    const tryPlay = () => {
      if (cancelled || v.paused === false) return; // already playing → idempotent
      const p = v.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err: unknown) => {
          // NotAllowedError = a hard policy block (Low Power Mode / battery /
          // Never-Auto-Play) → swap to the poster so the user never sees the
          // stuck gray play button. AbortError (a StrictMode/competing-play
          // interrupt) is transient → a readiness event or gesture will retry.
          if (err instanceof DOMException && err.name === 'NotAllowedError') {
            setAutoplayBlocked(true);
          }
        });
      }
    };

    tryPlay();
    v.addEventListener('canplay', tryPlay);
    v.addEventListener('loadeddata', tryPlay);
    const onGesture = () => tryPlay();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);

    return () => {
      cancelled = true;
      v.removeEventListener('canplay', tryPlay);
      v.removeEventListener('loadeddata', tryPlay);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
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

  const showPoster = motionless || errored || autoplayBlocked;

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
              ref={attachVideo}
              data-testid="intro-horse-video"
              poster="/assets/horse-intro-poster.jpg"
              preload="auto"
              autoPlay
              muted
              playsInline
              onError={() => setErrored(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            >
              {/* MP4/H.264 FIRST: Safari reports webm as "maybe" then stalls on VP9,
                  so list the universally-decodable H.264 source ahead of webm. */}
              <source src="/assets/horse-intro.mp4" type="video/mp4" />
              <source src="/assets/horse-intro.webm" type="video/webm" />
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
