import { useMemo } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Container,
  Grid,
  Snackbar,
} from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  useGetStreaksQuery,
  useGetCalendarQuery,
  useCheckInMutation,
} from '../store/streaksApi';
import { logout, type AppDispatch } from '../store';
import StreakCounter from './StreakCounter';
import CalendarHeatMap from './CalendarHeatMap';
import MilestoneProgress from './MilestoneProgress';
import PersonalBest from './PersonalBest';
import FreezeStatus from './FreezeStatus';
import RewardHistory from './RewardHistory';
import ShareButton from './ShareButton';
import ImageButton from './ImageButton';
import Editable from '../editor/Editable';

const LOGO = '/assets/dashboard/ui/logo.png';
const SHIELD = '/assets/dashboard/ui/shield.png';
const BTN_CHECKIN = '/assets/dashboard/ui/btn-checkin.png';
const BTN_LOGOUT = '/assets/dashboard/ui/btn-logout.png';

/** UI display clamp (FR-1.7) — true value can exceed 365, display does not. */
const DISPLAY_CAP = 365;
const clamp = (n: number) => Math.min(n, DISPLAY_CAP);

/** Current UTC month YYYY-MM for the calendar query. */
function currentUtcMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function StreakDashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

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
        <Box component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, m: 0 }}>
          <Editable id="shield" label="Shield crest">
            <Box
              component="img"
              src={SHIELD}
              alt=""
              sx={{ height: 56, width: 'auto', display: 'block', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))' }}
            />
          </Editable>
          <Editable id="logo" label="Logo wordmark">
            <Box
              component="img"
              src={LOGO}
              alt=""
              sx={{ height: 44, width: 'auto', display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
            />
          </Editable>
          <Box component="span" sx={visuallyHidden}>
            Hijack Daily Streaks
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Editable id="btn-checkin" label="Check-in button">
            <ImageButton
              src={BTN_CHECKIN}
              alt="Check in today"
              height={52}
              disabled={checkInState.isLoading}
              onClick={() => checkIn()}
            />
          </Editable>
          {/* secondary actions grouped together */}
          <ShareButton />
          <Editable id="btn-logout" label="Log-out button">
            <ImageButton src={BTN_LOGOUT} alt="Log out" height={52} onClick={handleLogout} />
          </Editable>
        </Box>
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
          <Grid item xs={12} sm={6} md={3}>
            <StreakCounter
              label="Login Streak"
              value={clamp(streaks.loginStreak)}
              best={clamp(streaks.bestLoginStreak)}
              motif="flame"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
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
          {/* right column: streak freezes stacked over personal best */}
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <FreezeStatus todayActivity={todayActivity} />
              <PersonalBest
                bestLoginStreak={streaks.bestLoginStreak}
                bestPlayStreak={streaks.bestPlayStreak}
              />
            </Box>
          </Grid>

          {/* reward history runs the full width along the bottom */}
          <Grid item xs={12}>
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
