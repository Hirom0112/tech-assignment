import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  CircularProgress,
  Box,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import ImageButton from './ImageButton';

const SHARE_BTN = '/assets/dashboard/ui/btn-share.png';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

/**
 * Share affordance (FR-9.2, API_CONTRACT.md §4.9). A top-bar button that fetches
 * the player's on-brand streak card (`GET …/share-card`, `image/svg+xml`) with
 * the `X-Player-Id` auth header, then shows it in a dialog as an `<img>` and
 * offers "Open in new tab". Generation only — no social posting (PROJECT.md §8).
 *
 * The card endpoint requires player auth, so a bare new-tab navigation cannot
 * carry the header; we fetch it here (header attached) and render the returned
 * SVG via a blob URL so the preview works for the demo player.
 */
export default function ShareButton() {
  const playerId =
    useSelector((s: RootState) => s.auth.playerId) ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('playerId') : null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  const cleanup = () => {
    if (cardUrl) URL.revokeObjectURL(cardUrl);
    setCardUrl(null);
  };

  const handleOpen = async () => {
    setOpen(true);
    setLoading(true);
    setError(false);
    cleanup();
    try {
      const res = await fetch(`${API_URL}/api/v1/player/streaks/share-card`, {
        headers: playerId ? { 'X-Player-Id': playerId } : undefined,
      });
      if (!res.ok) throw new Error(`share-card ${res.status}`);
      const svg = await res.text();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      setCardUrl(URL.createObjectURL(blob));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    cleanup();
  };

  return (
    <>
      <ImageButton src={SHARE_BTN} alt="Share" onClick={handleOpen} height={54} />

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Your Hot Streak card</DialogTitle>
        <DialogContent>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress color="primary" />
            </Box>
          )}
          {error && (
            <Typography color="error" sx={{ py: 4, textAlign: 'center' }}>
              Could not generate your share card. Is the backend running on :5001?
            </Typography>
          )}
          {cardUrl && !loading && !error && (
            <Box
              component="img"
              src={cardUrl}
              alt="Hijack Poker streak card"
              sx={{ width: '100%', height: 'auto', borderRadius: 2, display: 'block' }}
            />
          )}
        </DialogContent>
        <DialogActions>
          {cardUrl && (
            <Button
              startIcon={<OpenInNewIcon />}
              onClick={() => window.open(cardUrl, '_blank', 'noopener')}
            >
              Open in new tab
            </Button>
          )}
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
