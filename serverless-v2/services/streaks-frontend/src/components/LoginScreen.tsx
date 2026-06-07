import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Box, MenuItem, Select, Typography } from '@mui/material';
import { login, type AppDispatch } from '../store';

/**
 * Seeded demo personas (ASSUMPTIONS A-2): a deliberate 4-persona cast that
 * exercises every state the dashboard can render. Ids stay streak-001..004 (the
 * demo default + tests reference them); the labels are what the picker shows.
 */
const SEEDED_PLAYERS = [
  { id: 'streak-001', label: 'The Grinder' },
  { id: 'streak-002', label: 'The Legend' },
  { id: 'streak-003', label: 'The Newcomer' },
  { id: 'streak-004', label: 'The Comeback' },
];

/** Generate a fresh, zero-state player id for Sign Up (backend auto-creates). */
function freshPlayerId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `player-${rand}`;
}

/**
 * BL-1 (rebuilt from real art): the "High Roller's Lounge" sign-in.
 *
 * Composition (matches the reference):
 *  - wall.jpg            full-bleed background (wall + green felt)
 *  - plaque.png          the HERO — wood frame + brushed-metal panel with the
 *                        "HIJACK POKER" wordmark, ace pip, and the "Est. 2023 ·
 *                        The High Roller's Lounge" footer ALL embossed in. We do
 *                        NOT recreate any of that — it's part of the image.
 *  - btn-signin/up.png   REAL <button>s positioned (as % of the plaque) inside
 *                        the plaque's blank lower metal panel, so they scale +
 *                        move WITH the plaque on resize.
 *  - a soft warm CSS glow up top stands in for the (un-provided) pendant lamp.
 *
 * The chips/cards prop assets are intentionally NOT used — they ship with solid
 * black backgrounds (not transparency) and can't be cleanly cut out, so they'd
 * read as black boxes over the felt. The hero scene carries the design; re-add
 * once transparent re-exports exist.
 *
 * Auth (unchanged): Sign In → login(playerId) → dashboard; Sign Up → fresh
 * player-<rand> id → login → dashboard. A compact, on-theme player picker sits
 * below the plaque (defaults to streak-001) so the demo seeds are reachable.
 * No theme switcher here — the login is the fixed brand scene.
 */

/**
 * A brushed-silver beveled metal frame, drawn purely in CSS. The Sign Up art
 * has a border on its top/bottom but almost none on its sides, so we paint a
 * uniform frame BEHIND the image: the button PNG carries a transparent margin,
 * and this gradient + inset bevel shows through it as an even raised edge on
 * all four sides (matching Sign In's baked-in metal frame). `FRAME_BEVEL` is the
 * inset shadow stack (dark outer rim + top highlight + bottom shade) reused in
 * every interaction state so the bevel stays put while the glow changes.
 */
const FRAME_FILL =
  'linear-gradient(180deg, #f4f4f7 0%, #c6c6ce 46%, #83838d 56%, #e4e4ea 100%)';
const FRAME_BEVEL =
  'inset 0 0 0 1.5px rgba(16,16,20,0.9), inset 0 2px 2px rgba(255,255,255,0.9), inset 0 -3px 5px rgba(0,0,0,0.5)';

/**
 * Shared sx for an image-button sitting on the plaque panel. The buttons sit
 * still at rest and only react to the pointer: on hover they "pick themselves
 * up" — lift toward the viewer, scale slightly, and light a colored glow
 * (warm gold for Sign In, cool steel for Sign Up, via `accent`). A diagonal
 * gleam sweeps across on hover; pressing pushes the button back down.
 *
 * `framed` paints a CSS silver bevel frame behind the image (Sign Up, whose art
 * lacks side edges). `rot` tilts the button (deg) to sit parallel to the plaque
 * frame. The hover glow is a `drop-shadow` filter (NOT box-shadow) so it hugs
 * the button's actual rounded shape instead of lighting up its bounding square.
 */
function plaqueButtonSx(accent: string, framed = false, rot = 0) {
  const tf = (extra: string) => `${extra} rotate(${rot}deg)`.trim();
  // Colored glow only — no dark drop-shadow (that read as an ugly black blob
  // under the button that lingered through the filter transition).
  const glow = (px: number) => `drop-shadow(0 0 ${px}px ${accent})`;
  return {
    position: 'absolute',
    transform: tf('translateY(0) scale(1)'),
    p: 0,
    border: 'none',
    background: framed ? FRAME_FILL : 'transparent',
    cursor: 'pointer',
    lineHeight: 0,
    borderRadius: '14px',
    overflow: 'hidden',
    boxShadow: framed ? FRAME_BEVEL : 'none',
    transition:
      'transform 220ms cubic-bezier(0.22,1,0.36,1), filter 220ms ease, box-shadow 220ms ease',
    '& img': { width: '100%', height: 'auto', display: 'block', borderRadius: '12px' },
    // gleam sweep — a diagonal highlight that crosses on hover
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: '12px',
      background:
        'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)',
      transform: 'translateX(-120%)',
      transition: 'transform 600ms ease',
      pointerEvents: 'none',
      mixBlendMode: 'screen',
    },
    // "pick me up": lift toward the viewer + a soft glow that follows the shape
    '&:hover': {
      transform: tf('translateY(-10px) scale(1.06)'),
      filter: `brightness(1.08) ${glow(16)}`,
    },
    '&:hover::after': { transform: 'translateX(120%)' },
    '&:active': {
      transform: tf('translateY(-2px) scale(1.02)'),
      filter: `brightness(0.99) ${glow(10)}`,
    },
    '&:focus-visible': {
      outline: '3px solid #F1D98C',
      outlineOffset: '3px',
      filter: glow(14),
    },
    // Reduced-motion: keep the glow, drop the lift/scale and the gleam sweep.
    '@media (prefers-reduced-motion: reduce)': {
      '&::after': { display: 'none' },
      '&:hover': { transform: tf(''), filter: glow(16) },
    },
  } as const;
}

export default function LoginScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const [playerId, setPlayerId] = useState('streak-001');

  const signIn = (id: string) => {
    dispatch(login(id.trim()));
    navigate('/', { replace: true });
  };
  const signUp = () => signIn(freshPlayerId());

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        backgroundImage: 'url(/assets/login/wall.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Pendant-lamp stand-in: warm glow up top + a soft dark vignette. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(60% 42% at 50% -6%, rgba(255,210,140,0.45) 0%, transparent 60%), radial-gradient(120% 100% at 50% 55%, transparent 45%, rgba(0,0,0,0.55) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Foreground props on the felt, flanking the plaque (transparent PNGs). */}
      <Box
        component="img"
        src="/assets/login/chips.png"
        alt=""
        aria-hidden
        sx={{
          position: 'absolute',
          left: '4.8%',
          top: '72.9%',
          width: '26%',
          maxWidth: 460,
          zIndex: 1,
          pointerEvents: 'none',
          filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.5))',
          userSelect: 'none',
        }}
      />
      <Box
        component="img"
        src="/assets/login/cards.png"
        alt=""
        aria-hidden
        sx={{
          position: 'absolute',
          left: '73.2%',
          top: '83.2%',
          width: '24%',
          maxWidth: 430,
          zIndex: 1,
          pointerEvents: 'none',
          filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.5))',
          userSelect: 'none',
        }}
      />

      {/* The HERO plaque — buttons + banner are positioned relative to it (so
          they scale + move WITH the plaque). The wordmark/pip/footer are baked
          into the art. Position/size dialled in via the layout edit pass. */}
      <Box
        sx={{
          position: 'absolute',
          left: '36.9%',
          top: '8.6%',
          width: '30.5%',
          zIndex: 2,
          aspectRatio: '1000 / 1378',
          // Subtle contact shadow only — the heavy 0 24px 50px black shadow read
          // as a dark halo around the frame; kept light so the plaque grounds
          // without a black ring. (The PNG's baked edge halo was also removed.)
          filter: 'drop-shadow(0 5px 14px rgba(0,0,0,0.28))',
        }}
      >
        <Box
          component="img"
          src="/assets/login/plaque.png"
          alt="Hijack Poker — The High Roller's Lounge"
          sx={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
          draggable={false}
        />

        {/* Sign In / Sign Up image-buttons in the plaque's blank metal panel
            (positioned as % of the plaque, so they scale + move with it). */}
        <Box
          component="button"
          type="button"
          aria-label="Sign In"
          onClick={() => signIn(playerId)}
          sx={{ ...plaqueButtonSx('rgba(217,164,65,0.6)', false, -0.75), left: '21%', top: '55%', width: '61.5%' }}
        >
          <img src="/assets/login/btn-signin.png" alt="" />
        </Box>

        <Box
          component="button"
          type="button"
          aria-label="Sign Up"
          onClick={signUp}
          sx={{ ...plaqueButtonSx('rgba(170,190,210,0.6)', false, -0.75), left: '21%', top: '70%', width: '61.5%' }}
        >
          <img src="/assets/login/btn-signup.png" alt="" />
        </Box>

        {/* Ornate brass nameplate covering the plaque's plain baked footer.
            Anchored to the plaque so it scales + moves with it. */}
        <Box
          component="img"
          src="/assets/login/lounge-banner.png"
          alt=""
          aria-hidden
          sx={{
            position: 'absolute',
            left: '31.7%',
            top: '89.4%',
            width: '42.1%',
            transform: 'rotate(-1.5deg) scaleX(1.2)',
            zIndex: 3,
            pointerEvents: 'none',
            userSelect: 'none',
            filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.55))',
          }}
          draggable={false}
        />
      </Box>

      {/* Compact, on-theme demo player picker (defaults to streak-001).
          Tucked top-right so it stays clear of the lounge banner below. */}
      <Box
        sx={{
          position: 'absolute',
          left: '84.6%',
          top: '1.8%',
          zIndex: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: 999,
          background: 'rgba(13,9,5,0.55)',
          border: '1px solid rgba(201,162,75,0.45)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Typography variant="caption" sx={{ color: '#C9B68F', letterSpacing: 1 }}>
          Signing in as
        </Typography>
        <Select
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          variant="standard"
          disableUnderline
          inputProps={{ 'aria-label': 'Demo player' }}
          sx={{
            color: '#F1D98C',
            fontWeight: 700,
            fontSize: 13,
            '& .MuiSelect-icon': { color: '#C9A24B' },
          }}
          MenuProps={{ PaperProps: { sx: { bgcolor: '#1B130C', color: '#F3E6CC' } } }}
        >
          {SEEDED_PLAYERS.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.label}
            </MenuItem>
          ))}
        </Select>
      </Box>
    </Box>
  );
}
