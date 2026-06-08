import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';

interface ImageButtonProps {
  /** Image source (transparent PNG). */
  src: string;
  /** Accessible name for the button. */
  alt: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Rendered height in px. */
  height?: number;
  sx?: SxProps<Theme>;
}

/**
 * A real <button> whose face is a painted PNG (the copper plaque/medallion art).
 * Keeps proper button semantics + an accessible name (so tests and screen readers
 * see it as a button), with a hover lift and active press.
 */
export default function ImageButton({
  src,
  alt,
  onClick,
  disabled = false,
  height = 52,
  sx,
}: ImageButtonProps) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={alt}
      sx={{
        p: 0,
        m: 0,
        border: 'none',
        background: 'none',
        lineHeight: 0,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))',
        transition: 'transform 120ms ease, filter 120ms ease',
        '&:hover': disabled
          ? {}
          : {
              transform: 'translateY(-1px) scale(1.03)',
              filter: 'drop-shadow(0 6px 11px rgba(0,0,0,0.6)) brightness(1.08)',
            },
        '&:active': disabled ? {} : { transform: 'translateY(0) scale(0.98)' },
        ...sx,
      }}
    >
      <Box component="img" src={src} alt="" sx={{ height, width: 'auto', display: 'block' }} />
    </Box>
  );
}
