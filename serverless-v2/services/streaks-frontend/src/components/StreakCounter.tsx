import { Box, Paper, Typography } from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import StyleIcon from '@mui/icons-material/Style';

export type Motif = 'flame' | 'cards';

interface StreakCounterProps {
  label: string;
  value: number;
  best: number;
  motif: Motif;
}

/** Visual cap for the grow effect (zero-dep CSS transform). */
const SCALE_CAP = 365;
const scaleFor = (streak: number) =>
  1 + Math.min(Math.max(streak, 0), SCALE_CAP) * 0.02;

/**
 * FR-4.1 / FR-4.2: a streak counter with a number, a growing motif
 * (flame for login, cards for play), and a personal-best line (FR-4.5 hook).
 */
export default function StreakCounter({
  label,
  value,
  best,
  motif,
}: StreakCounterProps) {
  const scale = scaleFor(value);
  const Icon = motif === 'flame' ? LocalFireDepartmentIcon : StyleIcon;
  const color = motif === 'flame' ? 'primary.main' : 'secondary.main';

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        height: '100%',
        border: '1px solid',
        borderColor: 'rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Box
        sx={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          data-testid={`motif-${motif}`}
          aria-label={motif}
          sx={{ fontSize: 48, color, transform: `scale(${scale})` }}
          style={{ transform: `scale(${scale})` }}
        />
      </Box>
      <Typography variant="h2" fontWeight={800} sx={{ lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Best: {best}
      </Typography>
    </Paper>
  );
}
