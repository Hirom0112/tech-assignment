import { Box, Typography } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import Panel from './Panel';
import Rule from './Rule';

interface PersonalBestProps {
  bestLoginStreak: number;
  bestPlayStreak: number;
}

/** FR-4.5: personal-best display (best login + best play). Presentational. */
export default function PersonalBest({
  bestLoginStreak,
  bestPlayStreak,
}: PersonalBestProps) {
  return (
    <Panel>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <EmojiEventsIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6">Personal Best</Typography>
      </Box>
      <Rule my={1} />
      <Box sx={{ display: 'flex', gap: 4 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Best Login
          </Typography>
          <Typography variant="h4" fontWeight={800}>
            {bestLoginStreak}
          </Typography>
        </Box>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Best Play
          </Typography>
          <Typography variant="h4" fontWeight={800}>
            {bestPlayStreak}
          </Typography>
        </Box>
      </Box>
    </Panel>
  );
}
