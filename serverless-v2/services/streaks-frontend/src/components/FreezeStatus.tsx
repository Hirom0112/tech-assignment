import { Box, Chip, List, ListItem, ListItemText, Typography } from '@mui/material';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import Panel from './Panel';
import Rule from './Rule';
import { useGetFreezesQuery } from '../store/streaksApi';

interface FreezeStatusProps {
  /** Today's activity, so we can show a "freeze active today" indicator (FR-4.6). */
  todayActivity?: string;
}

/** FR-4.6: freeze balance, "active today" indicator, and last-used history. Fetches /freezes. */
export default function FreezeStatus({ todayActivity }: FreezeStatusProps) {
  const { data, isLoading, isError } = useGetFreezesQuery();

  return (
    <Panel>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <AcUnitIcon sx={{ color: '#6FB6D6' }} />
        <Typography variant="h6">Streak Freezes</Typography>
      </Box>
      <Rule my={1} />

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

          <Rule my={1.5} />
          <Typography variant="subtitle2">Last used</Typography>
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
    </Panel>
  );
}
