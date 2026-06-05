import { Box, LinearProgress, Paper, Typography } from '@mui/material';
import type { Milestone } from '../types/streaks.types';

interface MilestoneProgressProps {
  loginStreak: number;
  playStreak: number;
  nextLoginMilestone: Milestone | null;
  nextPlayMilestone: Milestone | null;
}

interface AxisProps {
  verb: string; // "Log in" | "Play"
  streak: number;
  milestone: Milestone | null;
  color: 'primary' | 'secondary';
}

function MilestoneAxis({ verb, streak, milestone, color }: AxisProps) {
  if (!milestone) {
    return (
      <Box>
        <Typography variant="subtitle2" color="text.secondary">
          {verb}
        </Typography>
        <Typography variant="body1" fontWeight={600}>
          Max milestone reached
        </Typography>
        <LinearProgress
          variant="determinate"
          value={100}
          color={color}
          sx={{ height: 8, borderRadius: 4, mt: 1 }}
        />
      </Box>
    );
  }

  const { days, reward, daysRemaining } = milestone;
  const pct = Math.min(100, Math.round((streak / days) * 100));

  return (
    <Box>
      <Typography variant="body1" fontWeight={600}>
        {verb} {daysRemaining} more day{daysRemaining === 1 ? '' : 's'} to earn{' '}
        {reward} bonus points!
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {streak} / {days} days
      </Typography>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={color}
        sx={{ height: 8, borderRadius: 4, mt: 1 }}
      />
    </Box>
  );
}

/**
 * FR-4.4: next-milestone copy + both-axis progress (login + play)
 * toward the next milestone, with a max-reached state when null (≥90).
 */
export default function MilestoneProgress({
  loginStreak,
  playStreak,
  nextLoginMilestone,
  nextPlayMilestone,
}: MilestoneProgressProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        border: '1px solid',
        borderColor: 'rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
      }}
    >
      <Typography variant="h6">Next Milestone</Typography>
      <MilestoneAxis
        verb="Log in"
        streak={loginStreak}
        milestone={nextLoginMilestone}
        color="primary"
      />
      <MilestoneAxis
        verb="Play"
        streak={playStreak}
        milestone={nextPlayMilestone}
        color="secondary"
      />
    </Paper>
  );
}
