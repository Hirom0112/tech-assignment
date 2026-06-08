import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import type { ReactNode } from 'react';

const LEATHER = '/assets/dashboard/frames/panel-leather.png';

interface PanelProps {
  children: ReactNode;
  /** Styles for the outer frame box. */
  sx?: SxProps<Theme>;
  /** Styles for the inner content area (padding/layout). */
  innerSx?: SxProps<Theme>;
}

/**
 * A card framed by the leather 9-slice panel art (CSS `border-image`): the four
 * ornate metal corners stay fixed and sharp while the gold edges and the leather
 * center stretch to ANY width/height — so this one asset skins every card. The
 * `fill` keyword paints the leather texture behind the content.
 */
export default function Panel({ children, sx, innerSx }: PanelProps) {
  return (
    <Box
      sx={{
        position: 'relative',
        height: '100%',
        boxSizing: 'border-box',
        borderStyle: 'solid',
        borderColor: 'transparent',
        borderWidth: 'var(--panel-border, 30px)',
        borderImageSource: `url(${LEATHER})`,
        borderImageSlice: '150 fill',
        borderImageWidth: 'var(--panel-border, 30px)',
        borderImageRepeat: 'stretch',
        ...sx,
      }}
    >
      <Box sx={{ position: 'relative', px: 0.5, ...innerSx }}>{children}</Box>
    </Box>
  );
}
