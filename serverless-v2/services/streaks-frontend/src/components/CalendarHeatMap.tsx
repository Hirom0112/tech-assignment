import { Box, Paper, Tooltip, Typography, useTheme } from '@mui/material';
import type { Activity, ActivityDay } from '../types/streaks.types';

/**
 * Default (dark-brand) heat-map colors (FR-4.3 / §5.1):
 * gray / light-green / dark-green / blue / red.
 * Each theme overrides these via `theme.palette.heatmap` so the 5 semantic
 * states stay distinguishable under every skin (BL-2).
 */
export const ACTIVITY_COLORS: Record<Activity, string> = {
  none: '#21262D',
  login_only: '#9BE9A8',
  played: '#2EA043',
  freeze: '#388BFD',
  broken: '#F85149',
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

interface CalendarHeatMapProps {
  month: string;
  days: ActivityDay[];
}

/**
 * FR-4.3: 30-day calendar heat map. CSS-grid of one cell per day,
 * each colored by its (normalized) activity, each wrapped in a tooltip.
 */
export default function CalendarHeatMap({ month, days }: CalendarHeatMapProps) {
  const theme = useTheme();
  // Theme-provided heat-map palette (falls back to the brand defaults).
  const colors = theme.palette.heatmap ?? ACTIVITY_COLORS;
  return (
    <Paper
      elevation={0}
      sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}
    >
      <Typography variant="h6" gutterBottom>
        Activity — {month}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 0.75,
        }}
      >
        {days.map((day) => {
          const activity = normalize(day.activity);
          const title = `${day.date} · ${LABEL[activity]} · login ${day.loginStreak} / play ${day.playStreak}`;
          return (
            <Tooltip key={day.date} title={title} arrow>
              <Box
                data-testid={`heatcell-${day.date}`}
                aria-label={title}
                sx={{
                  aspectRatio: '1 / 1',
                  borderRadius: 1,
                  backgroundColor: colors[activity],
                  cursor: 'default',
                  transition: 'transform 120ms',
                  '&:hover': { transform: 'scale(1.12)' },
                }}
              />
            </Tooltip>
          );
        })}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
        {(Object.keys(ACTIVITY_COLORS) as Activity[]).map((a) => (
          <Box key={a} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: 0.5,
                backgroundColor: colors[a],
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {LABEL[a]}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
