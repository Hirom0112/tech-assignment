import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';

/**
 * BL-1: full-screen branded intro video. Auto-advances to /login on end or
 * Skip. Native <video> — no new deps (STND-5). If the video fails to load we
 * fall back to a branded splash that still advances.
 */
export default function IntroScene() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  const advance = () => navigate('/login', { replace: true });

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {!failed ? (
        <video
          src="/assets/intro.mp4"
          autoPlay
          muted
          playsInline
          onEnded={advance}
          onError={() => setFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        // Graceful fallback splash (still advances via Skip / Enter button).
        <Box sx={{ textAlign: 'center', color: '#F3E6CC' }}>
          <Typography
            variant="h2"
            sx={{ fontFamily: 'Georgia, serif', fontWeight: 800, letterSpacing: 2 }}
          >
            HIJACK POKER
          </Typography>
          <Typography variant="h6" sx={{ color: '#C9A24B', mt: 1 }}>
            Daily Streaks
          </Typography>
          <Button
            variant="contained"
            onClick={advance}
            sx={{
              mt: 4,
              bgcolor: '#C9A24B',
              color: '#231711',
              fontWeight: 700,
              '&:hover': { bgcolor: '#D8B763' },
            }}
          >
            Enter the Lounge
          </Button>
        </Box>
      )}

      <Button
        onClick={advance}
        variant="outlined"
        sx={{
          position: 'absolute',
          top: 20,
          right: 20,
          color: '#F3E6CC',
          borderColor: 'rgba(243,230,204,0.5)',
          backdropFilter: 'blur(4px)',
          '&:hover': { borderColor: '#F3E6CC', bgcolor: 'rgba(0,0,0,0.3)' },
        }}
      >
        Skip
      </Button>
    </Box>
  );
}
