import {
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
} from '@mui/material';
import RedeemIcon from '@mui/icons-material/Redeem';
import { useGetRewardsQuery } from '../store/streaksApi';

/** FR-4.7: reward history — each reward's date, milestone, type, points. Fetches /rewards. */
export default function RewardHistory() {
  const { data, isLoading, isError } = useGetRewardsQuery();

  return (
    <Paper
      elevation={0}
      sx={{ p: 3, border: '1px solid', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <RedeemIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6">Reward History</Typography>
      </Box>

      {isLoading && <Typography color="text.secondary">Loading rewards…</Typography>}
      {isError && (
        <Typography color="error">Could not load reward history.</Typography>
      )}

      {data && data.length === 0 && (
        <Typography color="text.secondary">
          No rewards earned yet — keep your streak alive!
        </Typography>
      )}

      {data && data.length > 0 && (
        <List dense disablePadding>
          {data.map((r) => (
            <ListItem
              key={r.rewardId}
              disableGutters
              secondaryAction={
                <Chip
                  label={`+${r.points}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              }
            >
              <ListItemText
                primary={`${r.milestone}-day ${
                  r.type === 'login_milestone' ? 'login' : 'play'
                } milestone`}
                secondary={new Date(r.createdAt).toISOString().slice(0, 10)}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
