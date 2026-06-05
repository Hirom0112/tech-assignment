import { useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Grid,
  Snackbar,
  Typography,
} from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import {
  useGetStreaksQuery,
  useGetCalendarQuery,
  useCheckInMutation,
} from '../store/streaksApi';
import StreakCounter from './StreakCounter';
import CalendarHeatMap from './CalendarHeatMap';
import MilestoneProgress from './MilestoneProgress';
import PersonalBest from './PersonalBest';
import FreezeStatus from './FreezeStatus';
import RewardHistory from './RewardHistory';

/** UI display clamp (FR-1.7) — true value can exceed 365, display does not. */
const DISPLAY_CAP = 365;
const clamp = (n: number) => Math.min(n, DISPLAY_CAP);

/** Current UTC month YYYY-MM for the calendar query. */
function currentUtcMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function StreakDashboard() {
  // The demo target seeded with all 5 heat-map states is streak-001 / 2026-04.
  // Default to that month so the seeded demo populates on load (ASSUMPTIONS A-2).
  const month = useMemo(
    () => import.meta.env.VITE_DEMO_MONTH || currentUtcMonth(),
    []
  );

  const streaksQ = useGetStreaksQuery();
  const calendarQ = useGetCalendarQuery(month);
  const [checkIn, checkInState] = useCheckInMutation();

  const streaks = streaksQ.data;
  const todayActivity = useMemo(() => {
    if (!calendarQ.data || !streaks?.lastLoginDate) return undefined;
    return calendarQ.data.days.find((d) => d.date === streaks.lastLoginDate)
      ?.activity;
  }, [calendarQ.data, streaks?.lastLoginDate]);

  return (
    <Container maxWidth="lg" sx={{ py: 5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          mb: 4,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <LocalFireDepartmentIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4" component="h1">
            Hijack Daily Streaks
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<CheckCircleIcon />}
          disabled={checkInState.isLoading}
          onClick={() => checkIn()}
        >
          {checkInState.isLoading ? 'Checking in…' : 'Check in today'}
        </Button>
      </Box>

      {streaksQ.isError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Could not reach the streaks API. Is the backend running on :5001?
        </Alert>
      )}

      {streaksQ.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress color="primary" />
        </Box>
      )}

      {streaks && (
        <Grid container spacing={3}>
          <Grid item xs={6} md={3}>
            <StreakCounter
              label="Login Streak"
              value={clamp(streaks.loginStreak)}
              best={clamp(streaks.bestLoginStreak)}
              motif="flame"
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <StreakCounter
              label="Play Streak"
              value={clamp(streaks.playStreak)}
              best={clamp(streaks.bestPlayStreak)}
              motif="cards"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <MilestoneProgress
              loginStreak={streaks.loginStreak}
              playStreak={streaks.playStreak}
              nextLoginMilestone={streaks.nextLoginMilestone}
              nextPlayMilestone={streaks.nextPlayMilestone}
            />
          </Grid>

          <Grid item xs={12} md={8}>
            {calendarQ.isError && (
              <Alert severity="error">Could not load the calendar.</Alert>
            )}
            {calendarQ.data && (
              <CalendarHeatMap
                month={calendarQ.data.month}
                days={calendarQ.data.days}
              />
            )}
          </Grid>
          <Grid item xs={12} md={4}>
            <PersonalBest
              bestLoginStreak={streaks.bestLoginStreak}
              bestPlayStreak={streaks.bestPlayStreak}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <FreezeStatus todayActivity={todayActivity} />
          </Grid>
          <Grid item xs={12} md={6}>
            <RewardHistory />
          </Grid>
        </Grid>
      )}

      <Snackbar
        open={checkInState.isSuccess}
        autoHideDuration={4000}
        message={
          checkInState.data?.milestoneEarned
            ? `Milestone! +${checkInState.data.milestoneEarned.points} points`
            : checkInState.data?.streakAdvanced
            ? 'Checked in — streak advanced!'
            : 'Already checked in today.'
        }
      />
    </Container>
  );
}
