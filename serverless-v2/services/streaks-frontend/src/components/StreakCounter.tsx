import { Box, Typography } from '@mui/material';
import Panel from './Panel';
import Editable from '../editor/Editable';

export type Motif = 'flame' | 'cards';

interface StreakCounterProps {
  label: string;
  value: number;
  best: number;
  motif: Motif;
}

/**
 * Motif scale as a function of the streak: small for a newcomer, growing
 * *proportionally* toward a capped maximum so a huge streak (e.g. the Legend's
 * 175) stays in proportion to its number and never blows out of the card. The
 * scale rises linearly with the streak up to `FULL_BY` days, then holds at `max`.
 */
const FULL_BY = 24;
const motifScale = (streak: number, min: number, max: number) =>
  min + (max - min) * Math.min(1, Math.max(0, streak) / FULL_BY);

/** Card fan: 0.74 for a fresh streak → 1.08 by ~24 days (was a 1.4 cap). */
const scaleFor = (streak: number) => motifScale(streak, 0.74, 1.08);

const POT_SRC = '/assets/dashboard/icons/pot.png';
const FLAMES_SRC = '/assets/dashboard/icons/flames.png';
const CARDS_SRC = '/assets/dashboard/icons/ace.png';

/**
 * Flame size as a function of the login streak: a tiny ember at 0, a full roar by
 * ~30 days, with a slight extra lift toward 90. The POT stays a fixed size; only
 * the flames grow — so the brazier is "alive + interactive".
 */
function flameScale(streak: number): number {
  // 0.72 for a fresh ember → 1.10 by ~24 days, then held (was a 1.28 cap that
  // the Legend's 175 hit, dwarfing its shrunk-to-fit number).
  return motifScale(streak, 0.72, 1.1);
}

/**
 * The interactive brazier: a STATIC pot with a separate FLAME layer that grows
 * with the login streak and gently breathes (no blended layers → no blur). The
 * streak number is embossed in gold over the flames. Honors prefers-reduced-motion.
 */
function FlameMotif({ value }: { value: number }) {
  return (
    <Box sx={{ position: 'relative', width: 118, height: 136 }}>
      {/* soft, slow ember glow at the rim */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          bottom: 28,
          width: 104,
          height: 66,
          transform: 'translateX(-50%)',
          background: 'radial-gradient(circle, rgba(255,150,45,0.5) 0%, rgba(255,90,20,0) 70%)',
          filter: 'blur(7px)',
          borderRadius: '50%',
          pointerEvents: 'none',
          animation: 'emberGlow 3s ease-in-out infinite',
          '@keyframes emberGlow': {
            '0%, 100%': { opacity: 0.45, transform: 'translateX(-50%) scale(1)' },
            '50%': { opacity: 0.75, transform: 'translateX(-50%) scale(1.12)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.55 },
        }}
      />
      {/* the pot — static, fixed size */}
      <Box
        component="img"
        src={POT_SRC}
        alt=""
        sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, mx: 'auto', width: 100, display: 'block' }}
      />
      {/* the flames — scaled by the streak, rising from inside the pot */}
      <Box
        data-testid="motif-flame"
        aria-label="flame"
        style={{ transform: `scale(${flameScale(value)})` }}
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
            height: 112,
            width: 'auto',
            objectFit: 'contain',
            transformOrigin: 'bottom center',
            // a livelier flicker: subtle squash/stretch + lateral sway + brightness
            // pulse, so the fire reads as "alive" rather than a static sprite.
            animation: 'flameFlicker 2.4s ease-in-out infinite',
            '@keyframes flameFlicker': {
              '0%, 100%': { transform: 'scaleY(1) scaleX(1) translateX(0)', filter: 'brightness(1)' },
              '25%': { transform: 'scaleY(1.06) scaleX(0.97) translateX(-0.5px)', filter: 'brightness(1.12)' },
              '50%': { transform: 'scaleY(1.02) scaleX(1.02) translateX(0.5px)', filter: 'brightness(1.05)' },
              '75%': { transform: 'scaleY(1.07) scaleX(0.96) translateX(-0.5px)', filter: 'brightness(1.14)' },
            },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
      </Box>
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
    <Panel editId={`card-${motif}`} editLabel={`${label} card`} innerSx={{ height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 196,
          justifyContent: 'space-between',
          py: 0.5,
        }}
      >
        {/* label — big + uppercase, anchors the top of the card */}
        <Typography
          sx={{
            fontFamily: '"Zilla Slab", Georgia, serif',
            fontWeight: 800,
            fontSize: 26,
            lineHeight: 1,
            color: 'text.primary',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}
        >
          {label}
        </Typography>

        {/* middle band — the hero NUMBER beside the motif, fills the vertical space */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            // login: number left / flame right (spread). play: cluster the number
            // and the (larger) card fan toward the centre — 6 nudged right, ace left.
            justifyContent: isFlame ? 'space-between' : 'center',
            flex: '1 1 auto',
            gap: isFlame ? 0.5 : 2.5,
            minWidth: 0,
          }}
        >
          <Typography
            sx={{
              fontFamily: '"Zilla Slab", Georgia, serif',
              fontWeight: 900,
              fontSize: value >= 100 ? 78 : 104,
              lineHeight: 0.85,
              letterSpacing: '-0.02em',
              color: isFlame ? '#EA8C2B' : 'text.primary',
              // carved / embossed "saloon signage" look from the concept art
              WebkitTextStroke: isFlame
                ? '1px rgba(70,30,8,0.5)'
                : '0.75px rgba(40,24,10,0.45)',
              textShadow: isFlame
                ? '0 2px 0 rgba(74,28,6,0.6), 0 5px 12px rgba(0,0,0,0.5), 0 1px 0 rgba(255,222,150,0.45)'
                : '0 2px 0 rgba(0,0,0,0.45), 0 5px 12px rgba(0,0,0,0.5), 0 1px 0 rgba(255,240,210,0.3)',
            }}
          >
            {value}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isFlame ? (
              <Editable id="brazier" label="Brazier">
                <FlameMotif value={value} />
              </Editable>
            ) : (
              <Editable id="ace" label="Card fan">
                <Box
                  component="img"
                  data-testid="motif-cards"
                  aria-label="cards"
                  src={CARDS_SRC}
                  alt=""
                  style={{ transform: `scale(${scaleFor(value)})` }}
                  sx={{ width: 108, height: 108, objectFit: 'contain', transformOrigin: 'center' }}
                />
              </Editable>
            )}
          </Box>
        </Box>

        {/* best — anchors the bottom */}
        <Typography
          sx={{ fontSize: 16, fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}
        >
          Best: {best} days
        </Typography>
      </Box>
    </Panel>
  );
}
