import { Box } from '@mui/material';

interface RuleProps {
  /** Vertical margin (theme spacing units). */
  my?: number;
}

/**
 * A thin engraved gold divider line — the section separator used across the
 * tavern panels (e.g. between the Login and Play blocks of Next Milestone, or
 * under a panel header). Drawn entirely in CSS, no asset.
 */
export default function Rule({ my = 1.25 }: RuleProps) {
  return (
    <Box
      sx={{
        my,
        height: '2px',
        width: '100%',
        borderRadius: 1,
        background:
          'linear-gradient(90deg, transparent 0%, rgba(201,162,75,0.55) 18%, rgba(201,162,75,0.6) 50%, rgba(201,162,75,0.55) 82%, transparent 100%)',
        boxShadow: '0 1px 0 rgba(0,0,0,0.35)',
      }}
    />
  );
}
