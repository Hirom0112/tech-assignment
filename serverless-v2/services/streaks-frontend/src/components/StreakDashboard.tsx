import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Grid,
  Snackbar,
} from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  streaksApi,
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
import BadgeCase from './BadgeCase';
import ShareButton from './ShareButton';
import ImageButton from './ImageButton';
import ScaleToFit from './ScaleToFit';
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

/** Shift a YYYY-MM month string by `delta` months (UTC). */
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The UTC month (YYYY-MM) `days` days before now — the calendar's back-limit. */
function monthDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** How far back the calendar may page (FR-4.3 demo affordance). */
const CALENDAR_LOOKBACK_DAYS = 90;

export default function StreakDashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const handleLogout = () => {
    // Clear the cached streaks data so the next player can't see this one's.
    dispatch(streaksApi.util.resetApiState());
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  // The calendar opens on the current UTC month (the live, in-progress streak)
  // and can page back up to 90 days — never into the future. `VITE_DEMO_MONTH`
  // optionally pins the INITIAL month (e.g. to a fuller past month for a demo).
  const maxMonth = useMemo(() => currentUtcMonth(), []);
  const minMonth = useMemo(() => monthDaysAgo(CALENDAR_LOOKBACK_DAYS), []);
  const [month, setMonth] = useState<string>(
    () => import.meta.env.VITE_DEMO_MONTH || maxMonth
  );
  const canPrev = month > minMonth;
  const canNext = month < maxMonth;
  const goPrev = () => setMonth((m) => (m > minMonth ? shiftMonth(m, -1) : m));
  const goNext = () => setMonth((m) => (m < maxMonth ? shiftMonth(m, +1) : m));

  const streaksQ = useGetStreaksQuery();
  const calendarQ = useGetCalendarQuery(month);
  const [checkIn, checkInState] = useCheckInMutation();

  const streaks = streaksQ.data;
  const todayActivity = useMemo(() => {
    if (!calendarQ.data || !streaks?.lastLoginDate) return undefined;
    return calendarQ.data.days.find((d) => d.date === streaks.lastLoginDate)
      ?.activity;
  }, [calendarQ.data, streaks?.lastLoginDate]);

  // The check-in toast is driven by LOCAL state (not the mutation's `isSuccess`,
  // which stays true and left the toast pinned). On success we capture the
  // message, open the toast, and `reset()` the mutation so an identical repeat
  // check-in re-fires this effect.
  const [snackMsg, setSnackMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!checkInState.isSuccess || !checkInState.data) return;
    const d = checkInState.data;
    setSnackMsg(
      d.milestoneEarned
        ? `Milestone! +${d.milestoneEarned.points} points`
        : d.streakAdvanced
        ? 'Checked in — streak advanced!'
        : 'Already checked in today.'
    );
    checkInState.reset();
  }, [checkInState]);

  return (
    <ScaleToFit designWidth={1440}>
      <Box sx={{ px: 5, py: 5 }}>
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
        <Box component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, m: 0, ml: { xs: 0, md: 8 } }}>
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
                onPrev={goPrev}
                onNext={goNext}
                canPrev={canPrev}
                canNext={canNext}
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

          {/* trophy shelf runs full width above the reward ledger */}
          <Grid item xs={12}>
            <BadgeCase />
          </Grid>

          {/* reward history runs the full width along the bottom */}
          <Grid item xs={12}>
            <RewardHistory />
          </Grid>
        </Grid>
      )}

      <Snackbar
        open={snackMsg !== null}
        autoHideDuration={4000}
        // `disableWindowBlurListener` keeps the auto-hide timer running even when
        // the window isn't focused (MUI pauses it by default), which otherwise
        // left the toast stuck on screen.
        disableWindowBlurListener
        onClose={() => setSnackMsg(null)}
        message={snackMsg ?? ''}
      />
      </Box>
    </ScaleToFit>
  );
}
