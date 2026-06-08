import { Box, List, ListItem, ListItemText, Typography } from '@mui/material';
import Panel from './Panel';
import Rule from './Rule';
import { useGetFreezesQuery } from '../store/streaksApi';

interface FreezeStatusProps {
  /** Today's activity, so we can show a "freeze active today" indicator (FR-4.6). */
  todayActivity?: string;
}

const ICE = '/assets/dashboard/icons/ice-flame.png';

/**
 * A small status "light" (like the indicator lamps in the concept art): a lit,
 * glowing lamp when `on`, an inert dark socket when off.
 */
function StatusLight({ on, color }: { on: boolean; color: string }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        width: 13,
        height: 13,
        borderRadius: '50%',
        flexShrink: 0,
        backgroundColor: on ? color : 'rgba(255,255,255,0.10)',
        border: on ? `1px solid ${color}` : '1px solid rgba(0,0,0,0.45)',
        boxShadow: on
          ? `0 0 9px ${color}, 0 0 3px ${color}, inset 0 1px 1px rgba(255,255,255,0.55)`
          : 'inset 0 1px 2px rgba(0,0,0,0.6)',
      }}
    />
  );
}

/** FR-4.6: freeze balance, "active today" indicator, and last-used history. Fetches /freezes. */
export default function FreezeStatus({ todayActivity }: FreezeStatusProps) {
  const { data, isLoading, isError } = useGetFreezesQuery();
  const activeToday = todayActivity === 'freeze';

  return (
    <Panel variant="top" editId="card-freezes" editLabel="Streak Freezes card" innerSx={{ textAlign: 'center' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
        <Box
          component="img"
          src={ICE}
          alt=""
          sx={{ width: 78, height: 78, objectFit: 'contain', filter: 'drop-shadow(0 0 5px rgba(111,182,214,0.85))' }}
        />
        <Typography variant="h6">Streak Freezes</Typography>
      </Box>
      <Rule my={1} />

      {isLoading && <Typography color="text.secondary">Loading freezes…</Typography>}
      {isError && (
        <Typography color="error">Could not load freeze status.</Typography>
      )}

      {data && (
        <>
          {/* indicator-lamp rows (concept art): freezes available + active status */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              alignItems: 'flex-start',
              width: 'fit-content',
              mx: 'auto',
              my: 1.25,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <StatusLight on={data.freezesAvailable > 0} color="#E0982F" />
              <Typography sx={{ fontWeight: 700 }}>
                {data.freezesAvailable} freeze{data.freezesAvailable === 1 ? '' : 's'} available
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <StatusLight on={activeToday} color="#6FB6D6" />
              <Typography
                sx={{ fontWeight: 700 }}
                color={activeToday ? 'text.primary' : 'text.secondary'}
              >
                Freeze status: {activeToday ? 'Active today' : 'None active'}
              </Typography>
            </Box>
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
                <ListItem key={`${h.date}-${h.source}`} disableGutters sx={{ justifyContent: 'center' }}>
                  <ListItemText
                    sx={{ flex: 'none', textAlign: 'center' }}
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
