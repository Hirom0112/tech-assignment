import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import PaletteIcon from '@mui/icons-material/Palette';
import { setTheme, type RootState, type AppDispatch } from '../store';
import { THEME_META, type ThemeName } from '../theme';

/**
 * BL-2: top-corner segmented control that switches the active theme LIVE.
 * Reads/writes the `theme` redux slice (which persists to localStorage and
 * drives `main.tsx`'s ThemeProvider).
 */
export default function ThemeSwitcher() {
  const dispatch = useDispatch<AppDispatch>();
  const active = useSelector((s: RootState) => s.theme.name);

  const handle = (_: unknown, next: ThemeName | null) => {
    if (next) dispatch(setTheme(next));
  };

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={active}
      onChange={handle}
      aria-label="Theme"
      sx={{
        backgroundColor: 'background.paper',
        borderRadius: 2,
        '& .MuiToggleButton-root': {
          px: 1.25,
          textTransform: 'none',
          fontWeight: 700,
          color: 'text.secondary',
        },
        '& .Mui-selected': {
          color: 'primary.main !important',
          backgroundColor: 'action.selected',
        },
      }}
    >
      <PaletteIcon
        fontSize="small"
        sx={{ alignSelf: 'center', mx: 0.75, color: 'text.secondary' }}
      />
      {THEME_META.map((t) => (
        <ToggleButton key={t.name} value={t.name} aria-label={t.label}>
          <Tooltip title={t.label} arrow>
            <span>{t.short}</span>
          </Tooltip>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
