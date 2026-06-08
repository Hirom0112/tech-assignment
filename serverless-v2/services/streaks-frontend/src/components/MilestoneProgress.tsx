import { Box, Typography } from '@mui/material';
import type { Milestone } from '../types/streaks.types';
import Panel from './Panel';
import Rule from './Rule';

interface MilestoneProgressProps {
  loginStreak: number;
  playStreak: number;
  nextLoginMilestone: Milestone | null;
  nextPlayMilestone: Milestone | null;
}

/** The milestone ladder (mirrors src/config/milestones.ts), evenly spaced on the bar. */
const LADDER = [3, 7, 14, 30, 60, 90];
const ANCHORS = [
  { v: 0, p: 0 },
  ...LADDER.map((v, i) => ({ v, p: ((i + 1) / LADDER.length) * 100 })),
];

/** Map a streak onto the evenly-spaced ladder (0 → 100%). */
function ladderPct(streak: number): number {
  if (streak >= LADDER[LADDER.length - 1]) return 100;
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i];
    const b = ANCHORS[i + 1];
    if (streak <= b.v) {
      const frac = (streak - a.v) / (b.v - a.v);
      return a.p + frac * (b.p - a.p);
    }
  }
  return 100;
}

/** A segmented progress bar with the full 3·7·14·30·60·90 ladder ticked along it. */
function LadderBar({
  streak,
  nextDays,
  accent,
}: {
  streak: number;
  nextDays: number | null;
  accent: string;
}) {
  const pct = ladderPct(streak);
  return (
    <Box sx={{ mt: 1.25 }}>
      <Box
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        sx={{
          position: 'relative',
          height: 12,
          borderRadius: 6,
          backgroundColor: 'rgba(20,12,6,0.55)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            width: `${pct}%`,
            borderRadius: 6,
            backgroundColor: accent,
            backgroundImage:
              'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.22) 100%)',
            boxShadow: `0 0 8px ${accent}99`,
            transition: 'width 600ms ease',
          }}
        />
        {/* tick marks on the track */}
        {LADDER.map((v, i) => {
          const p = ((i + 1) / LADDER.length) * 100;
          return (
            <Box
              key={v}
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${p}%`,
                width: '1.5px',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0,0,0,0.35)',
              }}
            />
          );
        })}
      </Box>
      {/* ladder labels */}
      <Box sx={{ position: 'relative', height: 15, mt: 0.25 }}>
        {LADDER.map((v, i) => {
          const p = ((i + 1) / LADDER.length) * 100;
          const reached = streak >= v;
          const isNext = nextDays === v;
          return (
            <Typography
              key={v}
              sx={{
                position: 'absolute',
                left: `${p}%`,
                transform: 'translateX(-50%)',
                fontSize: 10,
                fontWeight: isNext ? 800 : 600,
                color: isNext ? accent : reached ? 'text.primary' : 'text.secondary',
              }}
            >
              {v}
            </Typography>
          );
        })}
      </Box>
    </Box>
  );
}

function MilestoneAxis({
  label,
  verb,
  streak,
  milestone,
  accent,
}: {
  label: string;
  verb: string;
  streak: number;
  milestone: Milestone | null;
  accent: string;
}) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ color: accent, fontWeight: 700 }}>
        {label}
      </Typography>
      {milestone ? (
        <Typography variant="body2" fontWeight={600}>
          {verb} {milestone.daysRemaining} more day{milestone.daysRemaining === 1 ? '' : 's'} to
          earn {milestone.reward} bonus points!
        </Typography>
      ) : (
        <Typography variant="body2" fontWeight={600}>
          Max milestone reached
        </Typography>
      )}
      <LadderBar streak={streak} nextDays={milestone?.days ?? null} accent={accent} />
    </Box>
  );
}

/**
 * FR-4.4: next-milestone copy + both-axis progress (login + play) on the full
 * milestone ladder, separated by an engraved rule, with a max-reached state when
 * null (≥90).
 */
export default function MilestoneProgress({
  loginStreak,
  playStreak,
  nextLoginMilestone,
  nextPlayMilestone,
}: MilestoneProgressProps) {
  const loginAccent = '#E08A3C';
  const playAccent = '#D9A441';
  return (
    <Panel innerSx={{ display: 'flex', flexDirection: 'column', py: 0.5 }}>
      <Typography variant="h6">Next Milestone</Typography>
      <Rule my={1} />
      <MilestoneAxis
        label="Login"
        verb="Log in"
        streak={loginStreak}
        milestone={nextLoginMilestone}
        accent={loginAccent}
      />
      <Rule my={1.5} />
      <MilestoneAxis
        label="Play"
        verb="Play"
        streak={playStreak}
        milestone={nextPlayMilestone}
        accent={playAccent}
      />
    </Panel>
  );
}
