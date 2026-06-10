import { useMemo } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import RedeemIcon from '@mui/icons-material/Redeem';
import { useGetRewardsQuery } from '../store/streaksApi';
import type { RewardRecord } from '../types/streaks.types';
import { badgeName } from '../config/badges';
import Editable from '../editor/Editable';

/** Parchment ledger background; the columns/rows are drawn in CSS on top of it. */
const PARCHMENT = '/assets/dashboard/frames/reward-parchment.png';
const INK = '#3a2a16'; // dark brown ledger ink (this panel is light-on-parchment)
const INK_SOFT = 'rgba(58,42,22,0.62)';
const RULE = 'rgba(58,42,22,0.18)';

/** 4-column ledger grid: Date · Milestone · Points · Type. */
const COLS = '0.9fr 1.9fr 0.9fr 1fr';

function fmtDate(iso: string): string {
  // Render from the UTC parts so it's stable regardless of viewer timezone.
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function RewardRow({
  reward,
  isNew,
  showBadge,
}: {
  reward: RewardRecord;
  isNew: boolean;
  /** A rank badge is earned once for life, so only the FIRST time a milestone was
   *  reached shows its rank tag; later re-reaches still log their points. */
  showBadge: boolean;
}) {
  const axisKey = reward.type === 'login_milestone' ? 'login' : 'play';
  const axis = axisKey === 'login' ? 'Login' : 'Play';
  const badge = showBadge ? badgeName(axisKey, reward.milestone) : null; // rank earned (first time only)
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: COLS,
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1.1,
        borderBottom: `1px solid ${RULE}`,
        fontFamily: '"Spectral", Georgia, serif',
        color: INK,
        '&:nth-of-type(even)': { backgroundColor: 'rgba(58,42,22,0.05)' },
      }}
    >
      <Typography sx={{ fontSize: 14, color: INK_SOFT }}>{fmtDate(reward.createdAt)}</Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
        {`${reward.milestone}-day ${axis.toLowerCase()} streak`}
      </Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#8a4b1f' }}>
        +{reward.points}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography sx={{ fontSize: 14 }}>{axis}</Typography>
        {/* the specific Trophy Shelf rank this milestone earned (e.g. "Deputy") */}
        {badge && (
          <Box
            component="span"
            sx={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.5,
              color: '#3a2a16',
              backgroundColor: '#d6b05c',
              border: '1px solid rgba(58,42,22,0.45)',
              borderRadius: 1,
              px: 0.6,
              py: '1px',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
            }}
          >
            {badge}
          </Box>
        )}
        {isNew && (
          <Box
            component="span"
            sx={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.5,
              color: '#fff',
              backgroundColor: '#b5451f',
              border: '1px solid rgba(0,0,0,0.25)',
              borderRadius: 1,
              px: 0.6,
              py: '1px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
            }}
          >
            NEW
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** FR-4.7: reward history — each reward's date, milestone, points, type. Fetches /rewards. */
export default function RewardHistory() {
  const { data, isLoading, isError } = useGetRewardsQuery();

  // Flag the two most recent rewards as NEW (the list is returned newest-first).
  const newCount = 2;

  // A rank badge is permanent ("never lose the badge"), so it's only *earned*
  // the first time its milestone is reached. Rewards arrive newest-first (the API
  // orders them by the sortable rewardId), so the LAST occurrence of each
  // (axis, milestone) is the oldest — the original earning event that gets the
  // rank tag; later re-reaches still log points but carry no badge. Letting later
  // (older) rows overwrite uses that guaranteed order directly, with no timestamp
  // re-parsing or tie-break ambiguity.
  const firstEarnedIds = useMemo(() => {
    const earliestId = new Map<string, string>();
    for (const r of data ?? []) {
      earliestId.set(`${r.type}-${r.milestone}`, r.rewardId);
    }
    return new Set(earliestId.values());
  }, [data]);

  return (
    <Editable id="card-rewards" label="Reward History card" fill>
    <Paper
      elevation={0}
      sx={{
        p: 0,
        overflow: 'hidden',
        borderRadius: 2,
        border: '1px solid rgba(40,26,12,0.55)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        backgroundImage: `url(${PARCHMENT})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: INK,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 1 }}>
        <RedeemIcon sx={{ color: '#8a4b1f' }} />
        <Typography variant="h6" sx={{ color: INK }}>
          Reward History
        </Typography>
      </Box>

      {isLoading && (
        <Typography sx={{ px: 2, pb: 2, color: INK_SOFT }}>Loading rewards…</Typography>
      )}
      {isError && (
        <Typography sx={{ px: 2, pb: 2, color: '#a33' }}>
          Could not load reward history.
        </Typography>
      )}
      {data && data.length === 0 && (
        <Typography sx={{ px: 2, pb: 2, color: INK_SOFT }}>
          No rewards earned yet — keep your streak alive!
        </Typography>
      )}

      {data && data.length > 0 && (
        <Box>
          {/* column header row */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: 1,
              px: 2,
              py: 0.75,
              borderBottom: `2px solid ${RULE}`,
              fontFamily: '"Cinzel", Georgia, serif',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: INK_SOFT,
            }}
          >
            <span>Date</span>
            <span>Milestone</span>
            <span>Points</span>
            <span>Type</span>
          </Box>
          {/* scrollable rows */}
          <Box sx={{ maxHeight: 340, overflowY: 'auto' }}>
            {data.map((r, i) => (
              <RewardRow
                key={r.rewardId}
                reward={r}
                isNew={i < newCount}
                showBadge={firstEarnedIds.has(r.rewardId)}
              />
            ))}
          </Box>
        </Box>
      )}
    </Paper>
    </Editable>
  );
}
