import { Box, Typography } from '@mui/material';
import Panel from './Panel';
import Rule from './Rule';

const SHIELD_FIRE = '/assets/dashboard/icons/shield-fire.png';

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
    <Panel editId="card-personalbest" editLabel="Personal Best card" innerSx={{ textAlign: 'center' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1.5 }}>
        <Box
          component="img"
          src={SHIELD_FIRE}
          alt=""
          sx={{ width: 135, height: 135, objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
        />
        <Typography variant="h6">Personal Best</Typography>
      </Box>
      <Rule my={1} />
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
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
