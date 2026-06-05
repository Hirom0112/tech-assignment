import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, IconButton, Tooltip } from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import LoginScreen from '../LoginScreen';
import IdleScene from './IdleScene';
import LogoReveal from './LogoReveal';
import HorseRunOff from './HorseRunOff';
import { useSequencer, TIMELINE } from './useSequencer';
import { useIntroSound } from './useIntroSound';

/**
 * The interactive staged app-open (Route A, desktop-first).
 *
 *   Beat 1  IdleScene   — static standing-horse still: scene "jumps" + pulses
 *   Beat 2  LogoReveal  — wordmark + HJ chip spin-in, layered over the idle
 *   Beat 3  await       — pulsing "Tap to ride in" prompt; WAITS for input
 *   Beat 4  HorseRunOff — on tap the horse gallops + recedes into the distance
 *           then cross-dissolve into the EXISTING art-deco LoginScreen and
 *           navigate('/login', { replace }) so the route finalizes invisibly.
 *
 * LoginScreen is rendered UNDER the cinematic the whole time and revealed by
 * fading the intro layers out (option A). Skip (button + Esc) jumps straight to
 * login (no run-off). prefers-reduced-motion renders the static end-state.
 */
export default function OpenSequence() {
  const navigate = useNavigate();
  const sound = useIntroSound();

  const finish = useCallback(() => {
    sound.stopAll();
    navigate('/login', { replace: true });
  }, [navigate, sound]);

  const seq = useSequencer({ onDone: finish });

  // Audio: chip-clink on the settle moment; gallop bed on the run-off exit.
  useEffect(() => {
    const unsub = seq.onSettle(() => sound.playChipSettle());
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (seq.exiting) sound.playGallop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq.exiting]);

  // Esc → skip; Enter/Space → tap (when awaiting input).
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
        {/* Beat 1 — idle still (stays beneath the logo the whole cinematic). */}
        {!seq.reducedMotion && (
          <IdleScene active={seq.phase !== 'done'} motionless={false} />
        )}

        {/* Beat 4 — horse run-off recede (only while exiting). */}
        {!seq.reducedMotion && seq.exiting && <HorseRunOff active={seq.exiting} />}

        {/* Beat 2/3 — logo + chip + tap prompt, over the idle. */}
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

      {/* Controls: Skip (top-right) + sound toggle (just left of it). */}
      {!seq.exiting && (
        <Box
          sx={{
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 10,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
          }}
          // Don't let the controls trigger the tap-anywhere handler.
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip title={sound.enabled ? 'Sound on' : 'Sound off'}>
            <IconButton
              onClick={sound.toggle}
              aria-label={sound.enabled ? 'Mute intro sound' : 'Unmute intro sound'}
              aria-pressed={sound.enabled}
              sx={{
                color: '#F3E6CC',
                bgcolor: 'rgba(0,0,0,0.25)',
                backdropFilter: 'blur(4px)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.4)' },
              }}
            >
              {sound.enabled ? <VolumeUpIcon /> : <VolumeOffIcon />}
            </IconButton>
          </Tooltip>

          <Button
            onClick={seq.skip}
            variant="outlined"
            sx={{
              color: '#F3E6CC',
              borderColor: 'rgba(243,230,204,0.5)',
              backdropFilter: 'blur(4px)',
              '&:hover': { borderColor: '#F3E6CC', bgcolor: 'rgba(0,0,0,0.3)' },
            }}
          >
            Skip
          </Button>
        </Box>
      )}
    </Box>
  );
}
