import { useEffect, useState } from 'react';
import { Box, Slider, Typography, Button, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/** Each knob writes a CSS custom property on :root that the components read. */
interface Knob {
  key: string;
  label: string;
  min: number;
  max: number;
  def: number;
  step?: number;
  unit: string;
}

const KNOBS: Knob[] = [
  { key: '--logo-h', label: 'Logo height', min: 24, max: 96, def: 44, unit: 'px' },
  { key: '--shield-h', label: 'Shield height', min: 28, max: 120, def: 56, unit: 'px' },
  { key: '--btn-h', label: 'Button height', min: 32, max: 96, def: 52, unit: 'px' },
  { key: '--panel-border', label: 'Frame thickness', min: 14, max: 50, def: 30, unit: 'px' },
  { key: '--flame-mult', label: 'Flame size', min: 0.6, max: 1.8, def: 1, step: 0.05, unit: '' },
];

function initialVisible(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).has('edit')) return true;
  return localStorage.getItem('editMode') === '1';
}

/**
 * A dev-only design tuner. Toggle with Cmd/Ctrl+Shift+E (or open with ?edit),
 * persisted to localStorage. Each slider writes a CSS variable the components
 * read, so you can resize the header art, buttons, panel frames, and the flame
 * live — then "Copy" the values and hand them over to bake in. Always mounted;
 * renders nothing until toggled on.
 */
export default function EditPanel() {
  const [visible, setVisible] = useState(initialVisible);
  const [vals, setVals] = useState<Record<string, number>>(() =>
    Object.fromEntries(KNOBS.map((k) => [k.key, k.def])),
  );

  useEffect(() => {
    for (const k of KNOBS) {
      document.documentElement.style.setProperty(k.key, `${vals[k.key]}${k.unit}`);
    }
  }, [vals]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setVisible((v) => {
          const next = !v;
          localStorage.setItem('editMode', next ? '1' : '0');
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const set = (key: string, v: number) => setVals((s) => ({ ...s, [key]: v }));
  const reset = () => setVals(Object.fromEntries(KNOBS.map((k) => [k.key, k.def])));
  const close = () => {
    localStorage.setItem('editMode', '0');
    setVisible(false);
  };
  const copy = () => {
    const css = KNOBS.map((k) => `${k.key}: ${vals[k.key]}${k.unit};`).join('\n');
    navigator.clipboard?.writeText(css).catch(() => {});
  };

  if (!visible) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 3000,
        width: 270,
        p: 2,
        borderRadius: 2,
        bgcolor: 'rgba(18,12,6,0.96)',
        border: '1px solid rgba(201,162,75,0.55)',
        color: '#F3E6CC',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontWeight: 700, color: '#E0B860', fontFamily: '"Zilla Slab", serif' }}>
          Edit mode
        </Typography>
        <IconButton size="small" onClick={close} sx={{ color: '#C9B68F' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      {KNOBS.map((k) => (
        <Box key={k.key} sx={{ mb: 1 }}>
          <Typography variant="caption" sx={{ display: 'block', mb: -0.5 }}>
            {k.label}: <b>{vals[k.key]}{k.unit}</b>
          </Typography>
          <Slider
            size="small"
            min={k.min}
            max={k.max}
            step={k.step ?? 1}
            value={vals[k.key]}
            onChange={(_, v) => set(k.key, v as number)}
            sx={{ color: '#E0B860' }}
          />
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
        <Button size="small" variant="outlined" onClick={copy} sx={{ flex: 1, color: '#E0B860', borderColor: 'rgba(201,162,75,0.5)' }}>
          Copy
        </Button>
        <Button size="small" variant="text" onClick={reset} sx={{ color: '#C9B68F' }}>
          Reset
        </Button>
      </Box>
      <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.65, lineHeight: 1.3 }}>
        Cmd/Ctrl+Shift+E toggles this. Drag to adjust live, then Copy and send me the values.
      </Typography>
    </Box>
  );
}
