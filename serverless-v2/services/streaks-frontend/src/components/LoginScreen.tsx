import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Box, MenuItem, Select, Typography } from '@mui/material';
import { keyframes } from '@emotion/react';
import { login, type AppDispatch } from '../store';

/** Seeded demo players (ASSUMPTIONS A-2): streak-001..010 as quick-picks. */
const SEEDED_IDS = Array.from(
  { length: 10 },
  (_, i) => `streak-${String(i + 1).padStart(3, '0')}`
);

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
 *  - chips.png/cards.png foreground props (bottom corners, non-interactive).
 *  - a soft warm CSS glow up top stands in for the (un-provided) pendant lamp.
 *
 * Auth (unchanged): Sign In → login(playerId) → dashboard; Sign Up → fresh
 * player-<rand> id → login → dashboard. A compact, on-theme player picker sits
 * below the plaque (defaults to streak-001) so the demo seeds are reachable.
 * No theme switcher here — the login is the fixed brand scene.
 */

// --- "alive" button idle bob (gentle, offset per button) -------------------
const bob = keyframes`
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-2px); }
`;

/**
 * Shared sx for an image-button sitting on the plaque panel. `accent` tints the
 * hover glow (warm gold for Sign In, cool steel for Sign Up); `delay` offsets
 * the idle bob so the two buttons don't breathe in sync.
 */
function plaqueButtonSx(accent: string, delay: string) {
  return {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    p: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    lineHeight: 0,
    borderRadius: '14px',
    overflow: 'hidden',
    transition:
      'transform 180ms cubic-bezier(0.22,1,0.36,1), filter 180ms ease, box-shadow 180ms ease',
    // idle "alive" bob (disabled under reduced-motion below)
    animation: `${bob} 3.2s ease-in-out ${delay} infinite`,
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
    '&:hover': {
      transform: 'translateX(-50%) translateY(-3px) scale(1.04)',
      filter: 'brightness(1.08)',
      boxShadow: `0 14px 30px ${accent}`,
      animationPlayState: 'paused',
    },
    '&:hover::after': { transform: 'translateX(120%)' },
    '&:active': {
      transform: 'translateX(-50%) translateY(1px) scale(0.98)',
      filter: 'brightness(0.98)',
      boxShadow: `0 4px 12px ${accent}`,
    },
    '&:focus-visible': {
      outline: '3px solid #F1D98C',
      outlineOffset: '3px',
    },
    // Respect reduced-motion: no idle bob, no gleam sweep (hover/press stay).
    '@media (prefers-reduced-motion: reduce)': {
      animation: 'none',
      '&::after': { display: 'none' },
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

      {/* Foreground prop: chip stacks, bottom-left. */}
      <Box
        component="img"
        src="/assets/login/chips.png"
        alt=""
        aria-hidden
        sx={{
          position: 'absolute',
          left: '-2%',
          bottom: '-2%',
          width: { xs: '40vw', md: '30vw' },
          maxWidth: 460,
          pointerEvents: 'none',
          filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.5))',
          zIndex: 1,
        }}
      />
      {/* Foreground prop: card deck, bottom-right. */}
      <Box
        component="img"
        src="/assets/login/cards.png"
        alt=""
        aria-hidden
        sx={{
          position: 'absolute',
          right: '-2%',
          bottom: '-1%',
          width: { xs: '38vw', md: '28vw' },
          maxWidth: 440,
          pointerEvents: 'none',
          filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.5))',
          zIndex: 1,
        }}
      />

      {/* The HERO plaque — buttons are positioned relative to it (so they
          scale + move WITH the plaque). The wordmark/pip/footer are baked in. */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 2,
          height: '90vh',
          maxHeight: 880,
          aspectRatio: '900 / 1229',
          filter: 'drop-shadow(0 24px 50px rgba(0,0,0,0.6))',
        }}
      >
        <Box
          component="img"
          src="/assets/login/plaque.png"
          alt="Hijack Poker — The High Roller's Lounge"
          sx={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
          draggable={false}
        />

        {/* Buttons inside the plaque's blank lower metal panel.
            Plaque is 900x1229; the blank panel spans ~y 48%–86%, inner metal
            ~x 12%–88%. Container is 58% wide, centered; Sign In ~55%, Sign Up
            below it ~70% (each top is the button's own vertical anchor). */}
        <Box
          component="button"
          type="button"
          aria-label="Sign In"
          onClick={() => signIn(playerId)}
          sx={{ ...plaqueButtonSx('rgba(217,164,65,0.55)', '0s'), top: '55%', width: '58%' }}
        >
          <img src="/assets/login/btn-signin.png" alt="" />
        </Box>

        <Box
          component="button"
          type="button"
          aria-label="Sign Up"
          onClick={signUp}
          sx={{ ...plaqueButtonSx('rgba(150,170,190,0.5)', '1.6s'), top: '70%', width: '58%' }}
        >
          <img src="/assets/login/btn-signup.png" alt="" />
        </Box>
      </Box>

      {/* Compact, on-theme demo player picker (defaults to streak-001). */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 18,
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
          {SEEDED_IDS.map((id) => (
            <MenuItem key={id} value={id}>
              {id}
            </MenuItem>
          ))}
        </Select>
      </Box>
    </Box>
  );
}
