import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import BoltIcon from '@mui/icons-material/Bolt';
import { login, type AppDispatch } from '../store';
import ThemeSwitcher from './ThemeSwitcher';

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
 * BL-1: art-deco "High Roller's Lounge" sign-in. Uses login-bg.png as the
 * backdrop and echoes the brass/wood card centerpiece. Stub auth only
 * (CLAUDE.md Inv 10/12 — no real credentials, no PII beyond the playerId).
 *
 * - Sign In  → dispatch login(chosen seeded id), navigate to dashboard.
 * - Sign Up  → generate a fresh id, dispatch login, navigate (backend makes
 *              the zero-state player on first read/check-in).
 * - "Continue as streak-001" → instant demo bypass to the dashboard.
 */
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
        // The art-deco lounge artwork as the hero backdrop (cover, centered).
        backgroundImage: 'url(/assets/login-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      {/* Readable overlay so the form sits legibly over the busy art. */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}>
        <ThemeSwitcher />
      </Box>

      {/* Brass/wood sign-in card echoing the artwork's centerpiece. */}
      <Paper
        elevation={16}
        sx={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 380,
          p: 4,
          borderRadius: 3,
          textAlign: 'center',
          color: '#F3E6CC',
          background: 'linear-gradient(160deg, #3A2A1C 0%, #271B10 100%)',
          border: '2px solid #C9A24B',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.6), 0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        <Typography
          variant="h3"
          sx={{
            fontFamily: 'Georgia, serif',
            fontWeight: 900,
            letterSpacing: 3,
            color: '#E9D9B0',
            textShadow: '0 2px 4px rgba(0,0,0,0.6)',
          }}
        >
          HIJACK
        </Typography>
        <Typography
          sx={{
            fontFamily: 'Georgia, serif',
            letterSpacing: 8,
            color: '#C9A24B',
            mb: 1,
          }}
        >
          ◆ POKER ◆
        </Typography>
        <Typography variant="body2" sx={{ color: '#C9B68F', mb: 3 }}>
          The High Roller's Lounge — Daily Streaks
        </Typography>

        <TextField
          select
          fullWidth
          size="small"
          label="Player"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          inputProps={{ 'aria-label': 'Player' }}
          sx={{
            mb: 2,
            '& .MuiInputBase-root': { color: '#F3E6CC', bgcolor: 'rgba(0,0,0,0.25)' },
            '& .MuiInputLabel-root': { color: '#C9B68F' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#7A5E33' },
          }}
        >
          {SEEDED_IDS.map((id) => (
            <MenuItem key={id} value={id}>
              {id}
            </MenuItem>
          ))}
        </TextField>

        <Stack spacing={1.5}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<LoginIcon />}
            onClick={() => signIn(playerId)}
            sx={{
              fontWeight: 800,
              color: '#231711',
              background: 'linear-gradient(180deg, #E7CE84 0%, #C9A24B 100%)',
              '&:hover': {
                background: 'linear-gradient(180deg, #F0DA9A 0%, #D8B763 100%)',
              },
            }}
          >
            Sign In
          </Button>

          <Button
            fullWidth
            variant="outlined"
            startIcon={<PersonAddIcon />}
            onClick={signUp}
            sx={{
              fontWeight: 700,
              color: '#F3E6CC',
              borderColor: '#7A5E33',
              '&:hover': { borderColor: '#C9A24B', bgcolor: 'rgba(201,162,75,0.08)' },
            }}
          >
            Sign Up
          </Button>

          <Button
            fullWidth
            size="small"
            startIcon={<BoltIcon />}
            onClick={() => signIn('streak-001')}
            sx={{ color: '#C9B68F', textTransform: 'none' }}
          >
            Continue as streak-001
          </Button>
        </Stack>

        <Typography
          variant="caption"
          sx={{ display: 'block', mt: 3, color: '#8A744A', letterSpacing: 1 }}
        >
          Est. 1928 · The High Roller's Lounge
        </Typography>
      </Paper>
    </Box>
  );
}
