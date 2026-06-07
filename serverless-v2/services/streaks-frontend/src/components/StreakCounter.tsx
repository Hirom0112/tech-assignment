import { Box, Paper, Typography } from '@mui/material';

export type Motif = 'flame' | 'cards';

interface StreakCounterProps {
  label: string;
  value: number;
  best: number;
  motif: Motif;
}

/** Visual cap + gentle grow factor for the motif (zero-dep CSS transform). */
const SCALE_CAP = 365;
const scaleFor = (streak: number) =>
  1 + Math.min(Math.max(streak, 0), SCALE_CAP) * 0.006;

const FIRE_SRC = '/assets/dashboard/icons/icon-fire.png';
const CARDS_SRC = '/assets/dashboard/icons/icon-cards.png';

/**
 * A "living" brazier: the painted PNG is one image (bowl + flames), so we keep a
 * STATIC base for the steady bowl, then stack two copies of the flames — clipped
 * to hide the bowl, blended with `screen`, and animated with looping non-uniform
 * scale/sway/brightness keyframes anchored at the base — plus a pulsing ember
 * glow behind. Two layers at different speeds make the flicker feel organic and
 * never visibly loop. Honors `prefers-reduced-motion`.
 */
function FlameMotif() {
  return (
    <Box sx={{ position: 'relative', width: 88, height: 124 }}>
      {/* pulsing ember glow */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          bottom: 8,
          width: 84,
          height: 84,
          transform: 'translateX(-50%)',
          background:
            'radial-gradient(circle, rgba(255,150,45,0.6) 0%, rgba(255,90,20,0) 70%)',
          filter: 'blur(5px)',
          borderRadius: '50%',
          pointerEvents: 'none',
          animation: 'emberGlow 2.4s ease-in-out infinite',
          '@keyframes emberGlow': {
            '0%, 100%': { opacity: 0.4, transform: 'translateX(-50%) scale(1)' },
            '50%': { opacity: 0.8, transform: 'translateX(-50%) scale(1.18)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.5 },
        }}
      />
      {/* static base — the steady bowl + a base flame */}
      <Box
        component="img"
        src={FIRE_SRC}
        alt=""
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {/* animated flame layer 1 — primary flicker */}
      <Box
        component="img"
        src={FIRE_SRC}
        alt=""
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          clipPath: 'inset(0 0 22% 0)',
          transformOrigin: 'bottom center',
          mixBlendMode: 'screen',
          willChange: 'transform, filter',
          animation: 'flameFlicker 1.7s ease-in-out infinite alternate',
          '@keyframes flameFlicker': {
            '0%': { transform: 'scaleY(1) scaleX(1) skewX(0deg)', filter: 'brightness(1)' },
            '30%': { transform: 'scaleY(1.07) scaleX(0.97) skewX(2.5deg)', filter: 'brightness(1.15)' },
            '60%': { transform: 'scaleY(0.96) scaleX(1.03) skewX(-2deg)', filter: 'brightness(0.92)' },
            '100%': { transform: 'scaleY(1.05) scaleX(0.99) skewX(1.5deg)', filter: 'brightness(1.1)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      />
      {/* animated flame layer 2 — faster horizontal sway, subtler */}
      <Box
        component="img"
        src={FIRE_SRC}
        alt=""
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          clipPath: 'inset(0 0 30% 0)',
          transformOrigin: 'bottom center',
          mixBlendMode: 'screen',
          opacity: 0.6,
          willChange: 'transform',
          animation: 'flameSway 1.1s ease-in-out infinite alternate',
          '@keyframes flameSway': {
            '0%': { transform: 'translateX(-1.5px) scaleY(1.02) skewX(-1.5deg)' },
            '100%': { transform: 'translateX(1.5px) scaleY(0.98) skewX(2deg)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0 },
        }}
      />
    </Box>
  );
}

/**
 * FR-4.1 / FR-4.2: a streak counter with a number, a motif (an animated brazier
 * for login, the card fan for play) that grows with the streak, and a
 * personal-best line (FR-4.5 hook).
 */
export default function StreakCounter({ label, value, best, motif }: StreakCounterProps) {
  const scale = scaleFor(value);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        height: '100%',
        border: '1px solid',
        borderColor: 'rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Box
        data-testid={`motif-${motif}`}
        aria-label={motif}
        style={{ transform: `scale(${scale})` }}
        sx={{
          height: 124,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transformOrigin: 'bottom center',
        }}
      >
        {motif === 'flame' ? (
          <FlameMotif />
        ) : (
          <Box
            component="img"
            src={CARDS_SRC}
            alt=""
            sx={{ width: 104, height: 104, objectFit: 'contain' }}
          />
        )}
      </Box>
      <Typography variant="h2" fontWeight={800} sx={{ lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Best: {best}
      </Typography>
    </Paper>
  );
}
