import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import LoginScreen from '../LoginScreen';
import HorseGallop from './HorseGallop';
import LogoReveal from './LogoReveal';
import { useSequencer, TIMELINE } from './useSequencer';

/**
 * The interactive staged app-open (Route A, desktop-first).
 *
 *   Beat 1  HorseGallop — the horse gallops, LOOPING + full-bleed, from load
 *   Beat 2  LogoReveal  — wordmark + HJ chip spin-in, layered over the gallop
 *   Beat 3  await       — pulsing "Tap to ride in" prompt; WAITS for input
 *   Beat 4  exit        — on tap the SAME galloping video recedes into the
 *           distance (one <video>, no second element) then cross-dissolve into
 *           the EXISTING art-deco LoginScreen and navigate('/login', replace).
 *
 * LoginScreen is rendered UNDER the cinematic the whole time and revealed by
 * fading the intro layers out (option A). There is no visible Skip button —
 * advancing is via tap-anywhere / Enter / Space (and Esc as a silent
 * accelerator straight to login). prefers-reduced-motion shows the static
 * poster (no autoplay video) + the logo end-state, then tap → login.
 */
export default function OpenSequence() {
  const navigate = useNavigate();

  // Push (not replace) so /intro stays in history: pressing Back from /login
  // returns to /intro, which remounts fresh and replays the cinematic from the
  // top (React Router unmounts/remounts the route — no frozen end-frame).
  const finish = useCallback(() => {
    navigate('/login');
  }, [navigate]);

  const seq = useSequencer({ onDone: finish });

  // Esc → silent skip accelerator (no visible Skip button); Enter/Space → tap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        seq.skip();
      } else if (
        seq.awaitingTap &&
        (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')
      ) {
        e.preventDefault();
        seq.tap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seq]);

  const introFadingOut = seq.phase === 'done';
  // The cinematic layers fade fully out only once we navigate; during `exit`
  // the run-off + lockup-dissolve animate while login fades up beneath them.
  const introLayerOpacity = seq.phase === 'done' ? 0 : 1;

  return (
    <Box
      sx={{ position: 'fixed', inset: 0, bgcolor: '#000', overflow: 'hidden' }}
      // Tap-anywhere advances while we're awaiting input.
      onClick={seq.awaitingTap ? seq.tap : undefined}
    >
      {/* Beat 4 target rendered underneath the whole time (option A). */}
      <Box sx={{ position: 'absolute', inset: 0 }} aria-hidden={!seq.exiting}>
        <LoginScreen />
      </Box>

      {/* Cinematic layers, cross-dissolved over the login. */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: introLayerOpacity,
          transition: `opacity ${TIMELINE.EXIT_TO_LOGIN_MS}ms ease`,
          pointerEvents: introFadingOut ? 'none' : 'auto',
        }}
      >
        {/* Beats 1 & 4 — ONE horse-video layer: gallops in once & holds during
            idle/logo/await, then replays + recedes on exit (no second <video>). */}
        <HorseGallop exiting={seq.exiting} motionless={seq.reducedMotion} />

        {/* Beat 2/3 — logo + chip + tap prompt, over the galloping horse. */}
        {(seq.logoActive || seq.reducedMotion) && (
          <LogoReveal
            active={seq.logoActive}
            static={seq.reducedMotion}
            awaitingTap={seq.awaitingTap}
            exiting={seq.exiting}
            onChipSettled={seq.onChipSettled}
            onTap={seq.tap}
          />
        )}
      </Box>
    </Box>
  );
}
