import { Box, Typography } from '@mui/material';
import Panel from './Panel';

export type Motif = 'flame' | 'cards';

interface StreakCounterProps {
  label: string;
  value: number;
  best: number;
  motif: Motif;
}

/**
 * Gentle grow factor for the motif (zero-dep CSS transform), clamped so a huge
 * streak (e.g. 95) can't blow the motif out of the card.
 */
const SCALE_CAP = 365;
const scaleFor = (streak: number) =>
  Math.min(1.4, 1 + Math.min(Math.max(streak, 0), SCALE_CAP) * 0.006);

const FIRE_SRC = '/assets/dashboard/icons/icon-fire.png';
const CARDS_SRC = '/assets/dashboard/icons/ace.png';

/**
 * A gently "alive" brazier: ONE painted image that very slowly breathes (a tiny
 * scaleY + brightness lift anchored at the base) under a soft, slow ember glow —
 * no overlapping blended layers, so there's no ghosting/blur. The streak number
 * is embossed in gold on the flames. Honors `prefers-reduced-motion`.
 */
function FlameMotif({ value }: { value: number }) {
  return (
    <Box sx={{ position: 'relative', width: 104, height: 142 }}>
      {/* soft, slow ember glow */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          bottom: 12,
          width: 88,
          height: 78,
          transform: 'translateX(-50%)',
          background:
            'radial-gradient(circle, rgba(255,150,45,0.45) 0%, rgba(255,90,20,0) 70%)',
          filter: 'blur(6px)',
          borderRadius: '50%',
          pointerEvents: 'none',
          animation: 'emberGlow 4.5s ease-in-out infinite',
          '@keyframes emberGlow': {
            '0%, 100%': { opacity: 0.4, transform: 'translateX(-50%) scale(1)' },
            '50%': { opacity: 0.6, transform: 'translateX(-50%) scale(1.06)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.5 },
        }}
      />
      {/* the brazier — a slow, subtle breathe (no blend layers → no blur) */}
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
          transformOrigin: 'bottom center',
          animation: 'flameBreathe 4s ease-in-out infinite',
          '@keyframes flameBreathe': {
            '0%, 100%': { transform: 'scaleY(1)', filter: 'brightness(1)' },
            '50%': { transform: 'scaleY(1.025)', filter: 'brightness(1.06)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      />
      {/* the streak number embossed in gold on the flames */}
      <Typography
        aria-hidden
        sx={{
          position: 'absolute',
          left: '50%',
          top: '46%',
          transform: 'translate(-50%, -50%)',
          fontFamily: '"Zilla Slab", Georgia, serif',
          fontWeight: 800,
          fontSize: value >= 100 ? 28 : 34,
          color: '#F6D98A',
          textShadow:
            '0 2px 5px rgba(90,20,0,0.85), 0 0 3px rgba(0,0,0,0.7), 0 1px 0 rgba(255,220,140,0.5)',
          pointerEvents: 'none',
          lineHeight: 1,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/**
 * FR-4.1 / FR-4.2: a streak counter laid out like the concept art — a left text
 * column (label, big number, best) beside the motif (an animated brazier with
 * the streak embossed on the flames for login, the metallic ace fan for play).
 * The motif grows with the streak.
 */
export default function StreakCounter({ label, value, best, motif }: StreakCounterProps) {
  const scale = scaleFor(value);
  const isFlame = motif === 'flame';

  return (
    <Panel innerSx={{ py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        {/* left: label + big number + best */}
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: '"Zilla Slab", Georgia, serif',
              fontWeight: 700,
              fontSize: 16,
              color: 'secondary.main',
              letterSpacing: 0.3,
            }}
          >
            {label}
          </Typography>
          <Typography
            sx={{
              fontFamily: '"Zilla Slab", Georgia, serif',
              fontWeight: 800,
              fontSize: 56,
              lineHeight: 1,
              color: isFlame ? '#E08A3C' : 'text.primary',
            }}
          >
            {value}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Best: {best} days
          </Typography>
        </Box>

        {/* right: the motif (grows with the streak) */}
        <Box
          data-testid={`motif-${motif}`}
          aria-label={motif}
          style={{ transform: `scale(${scale})` }}
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          {isFlame ? (
            <FlameMotif value={value} />
          ) : (
            <Box
              component="img"
              src={CARDS_SRC}
              alt=""
              sx={{ width: 124, height: 124, objectFit: 'contain' }}
            />
          )}
        </Box>
      </Box>
    </Panel>
  );
}
