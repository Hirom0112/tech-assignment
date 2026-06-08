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

const POT_SRC = '/assets/dashboard/icons/pot.png';
const FLAMES_SRC = '/assets/dashboard/icons/flames.png';
const CARDS_SRC = '/assets/dashboard/icons/ace.png';

/**
 * Flame size as a function of the login streak: a tiny ember at 0, a full roar by
 * ~30 days, with a slight extra lift toward 90. The POT stays a fixed size; only
 * the flames grow — so the brazier is "alive + interactive".
 */
function flameScale(streak: number): number {
  const s = Math.max(0, streak);
  if (s >= 20) return Math.min(1.2, 1 + (s - 20) * 0.0016);
  return 0.62 + (s / 20) * 0.38; // 0.62 → 1.0 across the first 20 days
}

/**
 * The interactive brazier: a STATIC pot with a separate FLAME layer that grows
 * with the login streak and gently breathes (no blended layers → no blur). The
 * streak number is embossed in gold over the flames. Honors prefers-reduced-motion.
 */
function FlameMotif({ value }: { value: number }) {
  return (
    <Box sx={{ position: 'relative', width: 156, height: 172 }}>
      {/* soft, slow ember glow at the rim */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          bottom: 30,
          width: 84,
          height: 56,
          transform: 'translateX(-50%)',
          background: 'radial-gradient(circle, rgba(255,150,45,0.4) 0%, rgba(255,90,20,0) 70%)',
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
      {/* the pot — static, fixed size */}
      <Box
        component="img"
        src={POT_SRC}
        alt=""
        sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, mx: 'auto', width: 138, display: 'block' }}
      />
      {/* the flames — scaled by the streak, rising from inside the pot */}
      <Box
        data-testid="motif-flame"
        aria-label="flame"
        style={{ transform: `scale(calc(${flameScale(value)} * var(--flame-mult, 1)))` }}
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 34,
          display: 'flex',
          justifyContent: 'center',
          transformOrigin: 'bottom center',
          pointerEvents: 'none',
        }}
      >
        <Box
          component="img"
          src={FLAMES_SRC}
          alt=""
          sx={{
            height: 142,
            width: 'auto',
            objectFit: 'contain',
            transformOrigin: 'bottom center',
            animation: 'flameBreathe 4s ease-in-out infinite',
            '@keyframes flameBreathe': {
              '0%, 100%': { transform: 'scaleY(1)', filter: 'brightness(1)' },
              '50%': { transform: 'scaleY(1.03)', filter: 'brightness(1.06)' },
            },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
      </Box>
      {/* the streak number embossed in gold over the flames */}
      <Typography
        aria-hidden
        sx={{
          position: 'absolute',
          left: '50%',
          top: '44%',
          transform: 'translate(-50%, -50%)',
          fontFamily: '"Zilla Slab", Georgia, serif',
          fontWeight: 800,
          fontSize: value >= 100 ? 26 : 32,
          color: '#F6D98A',
          textShadow:
            '0 2px 5px rgba(90,20,0,0.9), 0 0 3px rgba(0,0,0,0.8), 0 1px 0 rgba(255,220,140,0.5)',
          pointerEvents: 'none',
          lineHeight: 1,
          zIndex: 2,
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {isFlame ? (
            <FlameMotif value={value} />
          ) : (
            <Box
              component="img"
              data-testid="motif-cards"
              aria-label="cards"
              src={CARDS_SRC}
              alt=""
              style={{ transform: `scale(${scaleFor(value)})` }}
              sx={{ width: 124, height: 124, objectFit: 'contain', transformOrigin: 'center' }}
            />
          )}
        </Box>
      </Box>
    </Panel>
  );
}
