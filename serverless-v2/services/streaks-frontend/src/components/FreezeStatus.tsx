import { Box, Chip, List, ListItem, ListItemText, Paper, Typography } from '@mui/material';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import { useGetFreezesQuery } from '../store/streaksApi';

interface FreezeStatusProps {
  /** Today's activity, so we can show a "freeze active today" indicator (FR-4.6). */
  todayActivity?: string;
}

/** FR-4.6: freeze balance, "active today" indicator, and last-used history. Fetches /freezes. */
export default function FreezeStatus({ todayActivity }: FreezeStatusProps) {
  const { data, isLoading, isError } = useGetFreezesQuery();

  return (
    <Paper
      elevation={0}
      sx={{ p: 3, border: '1px solid', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <AcUnitIcon sx={{ color: '#388BFD' }} />
        <Typography variant="h6">Streak Freezes</Typography>
      </Box>

      {isLoading && <Typography color="text.secondary">Loading freezes…</Typography>}
      {isError && (
        <Typography color="error">Could not load freeze status.</Typography>
      )}

      {data && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Typography variant="h4" fontWeight={800}>
              {data.freezesAvailable}
            </Typography>
            <Typography color="text.secondary">available</Typography>
            {todayActivity === 'freeze' && (
              <Chip
                label="Freeze active today"
                size="small"
                sx={{ bgcolor: '#388BFD', color: '#fff' }}
              />
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            Used this month: {data.freezesUsedThisMonth}
          </Typography>

          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Last used
          </Typography>
          {data.history.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No freezes used yet.
            </Typography>
          ) : (
            <List dense disablePadding>
              {data.history.map((h) => (
                <ListItem key={`${h.date}-${h.source}`} disableGutters>
                  <ListItemText
                    primary={h.date}
                    secondary={h.source.replace('_', ' ')}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </>
      )}
    </Paper>
  );
}
