import { Box, Tooltip, Typography, useTheme } from '@mui/material';
import type { Activity, ActivityDay } from '../types/streaks.types';
import Panel from './Panel';
import Rule from './Rule';

/**
 * Default (dark-brand) heat-map colors (FR-4.3 / §5.1) — kept as the cell-tint
 * fallback and for back-compat. Each theme overrides these via
 * `theme.palette.heatmap`; the tavern skin layers a painted ICON on top.
 */
export const ACTIVITY_COLORS: Record<Activity, string> = {
  none: '#21262D',
  login_only: '#9BE9A8',
  played: '#2EA043',
  freeze: '#388BFD',
  broken: '#F85149',
};

/** Painted glyph per state (none = empty slot, no icon). */
export const ACTIVITY_ICONS: Partial<Record<Activity, string>> = {
  login_only: '/assets/dashboard/icons/cell-login.png',
  played: '/assets/dashboard/icons/cell-played.png',
  freeze: '/assets/dashboard/icons/cell-freeze.png',
  broken: '/assets/dashboard/icons/cell-broken.png',
};

const KNOWN: ReadonlySet<string> = new Set<Activity>([
  'none',
  'login_only',
  'played',
  'freeze',
  'broken',
]);

/** Tolerate unknown enum values — treat unknown `activity` as `none` (§7). */
function normalize(activity: string): Activity {
  return (KNOWN.has(activity) ? activity : 'none') as Activity;
}

const LABEL: Record<Activity, string> = {
  none: 'No activity',
  login_only: 'Logged in',
  played: 'Played',
  freeze: 'Freeze used',
  broken: 'Streak broken',
};

/** Sunday-first weekday initials for the calendar header. */
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** "2026-04" → "April 2026". */
function fmtMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${name} ${y}`;
}

/** UTC weekday (0=Sun…6=Sat) of a YYYY-MM-DD date. */
function weekday(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

interface CalendarHeatMapProps {
  month: string;
  days: ActivityDay[];
}

/**
 * FR-4.3: month calendar heat map — a 7-column Sunday→Saturday grid (the first
 * day is offset to its real weekday) filling the panel width. Each day is a dark
 * leather well carrying a painted icon (person / cards / ice / broken-heart), or
 * an empty well for `none`. Each cell keeps its tooltip + testid + aria-label.
 */
export default function CalendarHeatMap({ month, days }: CalendarHeatMapProps) {
  const theme = useTheme();
  const colors = theme.palette.heatmap ?? ACTIVITY_COLORS;
  const leadOffset = days.length ? weekday(days[0].date) : 0;

  return (
    <Panel editId="card-calendar" editLabel="Calendar card" innerSx={{ py: 0.5 }}>
      <Typography variant="h6">{fmtMonth(month)}</Typography>
      <Rule my={1} />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.75 }}>
        {/* weekday header row (S M T W T F S) */}
        {WEEKDAYS.map((d, i) => (
          <Typography
            key={`wd-${i}`}
            align="center"
            sx={{
              fontFamily: '"Zilla Slab", Georgia, serif',
              fontWeight: 700,
              fontSize: 12,
              color: 'text.secondary',
              pb: 0.25,
            }}
          >
            {d}
          </Typography>
        ))}
        {/* lead blanks so day 1 lands under its real weekday */}
        {Array.from({ length: leadOffset }).map((_, i) => (
          <Box key={`lead-${i}`} sx={{ aspectRatio: '1 / 1' }} />
        ))}
        {days.map((day) => {
          const activity = normalize(day.activity);
          const icon = ACTIVITY_ICONS[activity];
          const title = `${day.date} · ${LABEL[activity]} · login ${day.loginStreak} / play ${day.playStreak}`;
          return (
            <Tooltip key={day.date} title={title} arrow>
              <Box
                data-testid={`heatcell-${day.date}`}
                data-activity={activity}
                aria-label={title}
                sx={{
                  aspectRatio: '1 / 1',
                  borderRadius: 1,
                  backgroundColor: 'rgba(20,12,6,0.5)',
                  boxShadow:
                    activity === 'none'
                      ? 'inset 0 2px 5px rgba(0,0,0,0.45)'
                      : `inset 0 2px 5px rgba(0,0,0,0.45), inset 0 0 0 1.5px ${colors[activity]}66`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'default',
                  transition: 'transform 120ms',
                  '&:hover': { transform: 'scale(1.12)' },
                }}
              >
                {/* faint day-of-month number */}
                <Typography
                  sx={{
                    position: 'absolute',
                    top: 2,
                    left: 4,
                    fontSize: 9,
                    fontWeight: 600,
                    lineHeight: 1,
                    color: 'rgba(247,236,212,0.45)',
                    pointerEvents: 'none',
                  }}
                >
                  {day.date.slice(-2)}
                </Typography>
                {icon && (
                  <Box
                    component="img"
                    src={icon}
                    alt={LABEL[activity]}
                    sx={{
                      width: '64%',
                      height: '64%',
                      objectFit: 'contain',
                      opacity: 0.92,
                      filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))',
                    }}
                  />
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
        {(Object.keys(LABEL) as Activity[]).map((a) => (
          <Box key={a} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 20,
                height: 20,
                borderRadius: 0.5,
                backgroundColor: 'rgba(20,12,6,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {ACTIVITY_ICONS[a] && (
                <Box
                  component="img"
                  src={ACTIVITY_ICONS[a]}
                  alt=""
                  sx={{ width: '80%', height: '80%', objectFit: 'contain' }}
                />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {LABEL[a]}
            </Typography>
          </Box>
        ))}
      </Box>
    </Panel>
  );
}
