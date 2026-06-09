import { Box, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { useGetBadgesQuery } from '../store/streaksApi';
import type { Badge } from '../types/streaks.types';
import { badgeSrc, type StreakAxis } from '../config/badges';
import Editable from '../editor/Editable';
import { useEditor } from '../editor/EditorContext';

/**
 * FR-4 (bonus) — the **Trophy Shelf**: a lifetime rank case mounted on a real
 * two-tier wooden shelf (LOGIN on the top ledge, PLAY on the bottom). A badge
 * tracks your *best ever* streak, so once earned it stays earned. Earned rungs
 * render full-colour; locked rungs are greyed in CSS (one art file per badge).
 *
 * Every asset + word here is wrapped in <Editable>, so the visual editor
 * (Cmd/Ctrl+Shift+E) can drag / rotate / scale each one independently. While the
 * editor is ACTIVE every badge is shown unlocked (full colour, no padlock) so the
 * whole shelf can be arranged; outside edit mode the real earned/locked state
 * applies. Geometry is % of the shelf art so it tracks the fixed-width dashboard.
 */

const SHELF = '/assets/dashboard/badges/shelf-wood.png';
const BANNER = '/assets/dashboard/badges/banner-parchment.png';
const RYE = '"Rye", "Zilla Slab", Georgia, serif';

// The shelf art is wide; cap its width so it stays compact instead of eating the
// whole page (it's a full-width grid row otherwise).
const SHELF_MAX_W = 1120; // px at the 1440 design width

// Each band: a banner pinned to the top of the compartment + a row of medallions
// bottom-anchored so they rest ON the shelf board. Bottoms tuned to the art:
// middle board ≈ 52%, bottom board ≈ 90% of the shelf height.
const SIDE = '4%';
const TOP_LEDGE = { top: '9%', height: '43%' };
const BOTTOM_LEDGE = { top: '54%', height: '36%' };

// Big medallions that FILL the compartment, growing slightly from left (3-day) to
// right (90-day legend). Sized so the largest still fits its column slot (no
// overlap) once spread across the ledge. `rank` = index 0..5.
const MEDALLION_BASE = 146; // px at the 1440 design width, then ScaleToFit
const MEDALLION_STEP = 4;
const medallionSize = (rank: number) => MEDALLION_BASE + rank * MEDALLION_STEP;

/** The little parchment ribbon that titles each ledge (LOGIN / PLAY). */
function LedgeBanner({ label }: { label: string }) {
  return (
    <Box
      sx={{
        backgroundImage: `url(${BANNER})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        px: 6,
        py: 0.4,
        minWidth: 230,
        textAlign: 'center',
        filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.55))',
      }}
    >
      <Typography
        sx={{
          fontFamily: RYE,
          fontSize: 20,
          lineHeight: 1.4,
          color: '#3A2412',
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

/** A single medallion + its day count and rank name. `rank` = rung index 0..5. */
function Medallion({
  axis,
  badge,
  rank,
  unlockAll,
}: {
  axis: StreakAxis;
  badge: Badge;
  rank: number;
  unlockAll: boolean;
}) {
  const { milestone, name } = badge;
  const earned = unlockAll || badge.earned;
  const state = badge.earned ? 'earned' : 'locked';
  const alt = `${name} badge (${milestone}-day ${axis} streak) — ${state}`;
  const size = medallionSize(rank);
  // A very slight warm edge glow that grows with the rank — the bigger, rarer
  // chips on the right glow a touch more. Earned only.
  const glow = `drop-shadow(0 0 ${(2.5 + rank * 1.4).toFixed(1)}px rgba(255,226,170,${(0.1 + rank * 0.045).toFixed(2)}))`;

  return (
    <Box
      data-testid={`badge-${axis}-${milestone}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        flex: '0 0 auto',
        width: size,
      }}
    >
      <Editable id={`badge-img-${axis}-${milestone}`} label={`${name} medallion`}>
        <Box
          sx={{
            position: 'relative',
            width: size,
            height: size,
            cursor: 'pointer',
            // A little "breath" on hover, like the check-in button: it lifts,
            // swells slightly, brightens; presses back down on click.
            transition: 'transform 130ms ease, filter 130ms ease',
            '&:hover': {
              transform: 'translateY(-5px) scale(1.05)',
              filter: 'brightness(1.1) drop-shadow(0 7px 12px rgba(0,0,0,0.55))',
            },
            '&:active': { transform: 'translateY(-1px) scale(1.0)' },
          }}
        >
          <Box
            component="img"
            src={badgeSrc(axis, milestone)}
            alt={alt}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              // Earned = full colour, richer, with a soft grounding shadow (no glow).
              // Locked = a dimmed-but-present dark-metal silhouette (not a faint ghost).
              filter: earned
                ? `saturate(1.12) contrast(1.06) drop-shadow(0 3px 5px rgba(0,0,0,0.65)) ${glow}`
                : 'grayscale(1) brightness(0.5) contrast(1.05)',
              opacity: earned ? 1 : 0.82,
              transition: 'filter 200ms ease, opacity 200ms ease',
            }}
          />
          {!earned && (
            <Box
              data-testid="badge-locked"
              sx={{
                position: 'absolute',
                right: 0,
                bottom: 2,
                width: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                backgroundColor: 'rgba(20,12,6,0.88)',
                border: '1px solid rgba(201,162,75,0.45)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.6)',
              }}
            >
              <LockIcon sx={{ fontSize: 13, color: '#DEC892' }} />
            </Box>
          )}
        </Box>
      </Editable>

      <Editable id={`badge-label-${axis}-${milestone}`} label={`${name} label`}>
        <Typography
          component="div"
          sx={{
            mt: 0.5,
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            lineHeight: 1.15,
            color: earned ? '#F4E3C0' : 'rgba(222,200,146,0.5)',
            textShadow: '0 1px 2px rgba(0,0,0,0.85)',
          }}
        >
          <Box component="span">
            {milestone} {milestone === 1 ? 'Day' : 'Days'}
          </Box>
          <br />
          <Box component="span">{name}</Box>
        </Typography>
      </Editable>
    </Box>
  );
}

/** One ledge of the shelf: a centred parchment banner above six medallions. */
function Ledge({
  axis,
  label,
  badges,
  band,
  unlockAll,
}: {
  axis: StreakAxis;
  label: string;
  badges: Badge[];
  band: { top: string; height: string };
  unlockAll: boolean;
}) {
  return (
    <Box
      sx={{
        position: 'absolute',
        left: SIDE,
        right: SIDE,
        top: band.top,
        height: band.height,
      }}
    >
      {/* Banner pinned to the top of the compartment (overlaps the back wall). */}
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <Editable id={`badge-banner-${axis}`} label={`${label} banner`}>
          <LedgeBanner label={label} />
        </Editable>
      </Box>
      {/* Medallions fill the compartment and sit on the board lip (bottom). */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'flex-end',
          // Centered with a FIXED gap so the gaps stay even even though the
          // medallions grow left→right (space-between made the right gaps shrink).
          justifyContent: 'center',
          gap: '18px',
        }}
      >
        {badges.map((b, i) => (
          <Medallion key={b.milestone} axis={axis} badge={b} rank={i} unlockAll={unlockAll} />
        ))}
      </Box>
    </Box>
  );
}

export default function BadgeCase() {
  const { data, isLoading, isError } = useGetBadgesQuery();
  const ed = useEditor();
  const unlockAll = !!ed?.active; // editing → show every badge unlocked for arranging

  return (
    <Box>
      {/* Title on a parchment plaque, like the saloon trophy case in the concept art.
          Lifted above the shelf (which is a later, transformed sibling) so the title
          and subtitle can be dragged over the shelf without slipping behind it. */}
      <Box sx={{ textAlign: 'center', mb: 1, position: 'relative', zIndex: 3 }}>
        <Editable id="badge-title" label="Trophy Shelf title">
          <Box
            sx={{
              display: 'inline-block',
              backgroundImage: `url(${BANNER})`,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
              px: 7,
              py: 0.75,
              filter: 'drop-shadow(0 4px 7px rgba(0,0,0,0.6))',
            }}
          >
            <Typography
              sx={{
                fontFamily: RYE,
                fontSize: 28,
                lineHeight: 1.1,
                color: '#3A2412',
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              Trophy Shelf
            </Typography>
          </Box>
        </Editable>
        <Box>
          <Editable id="badge-subtitle" label="Trophy Shelf subtitle">
            <Typography variant="body2" sx={{ color: '#DEC892', mt: 0.75 }}>
              Lifetime ranks — your best streak ever. Once earned, always yours.
            </Typography>
          </Editable>
        </Box>
      </Box>

      {isLoading && (
        <Typography sx={{ textAlign: 'center', color: 'text.secondary', py: 3 }}>
          Loading badges…
        </Typography>
      )}
      {isError && (
        <Typography sx={{ textAlign: 'center', color: '#D9544D', py: 3 }}>
          Could not load the trophy shelf.
        </Typography>
      )}

      {data && (
        <Editable id="badge-shelf" label="Wooden shelf" fill>
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              maxWidth: SHELF_MAX_W,
              mx: 'auto',
              aspectRatio: '1200 / 641',
              backgroundImage: `url(${SHELF})`,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}
          >
            <Ledge axis="login" label="Login" badges={data.login} band={TOP_LEDGE} unlockAll={unlockAll} />
            <Ledge axis="play" label="Play" badges={data.play} band={BOTTOM_LEDGE} unlockAll={unlockAll} />
          </Box>
        </Editable>
      )}
    </Box>
  );
}
