import { Box, Slider, Typography, Button, Divider } from '@mui/material';
import { useEditor, IDENTITY } from './EditorContext';

function Row({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <Box sx={{ mb: 0.5 }}>
      <Typography variant="caption" sx={{ display: 'block', mb: -0.5 }}>
        {label}: <b>{fmt ? fmt(value) : value}</b>
      </Typography>
      <Slider
        size="small"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(_, v) => onChange(v as number)}
        sx={{ color: '#E0B860' }}
      />
    </Box>
  );
}

/**
 * The floating editor controls (shown when edit mode is on). Pick an asset on the
 * page (it outlines gold), then move it by dragging or fine-tune rotation / width
 * / length / flip here. "Copy layout" exports every override as JSON to hand back.
 */
export default function EditorToolbar() {
  const ed = useEditor();
  if (!ed?.active) return null;

  const id = ed.selectedId;
  const t = id ? ed.overrides[id] ?? IDENTITY : null;
  const set = (patch: Parameters<typeof ed.update>[1]) => id && ed.update(id, patch);

  const copy = () => {
    navigator.clipboard?.writeText(ed.exportJson()).catch(() => {});
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 4000,
        width: 290,
        p: 2,
        borderRadius: 2,
        bgcolor: 'rgba(18,12,6,0.97)',
        border: '1px solid rgba(201,162,75,0.55)',
        color: '#F3E6CC',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography sx={{ fontWeight: 700, color: '#E0B860', fontFamily: '"Zilla Slab", serif' }}>
          Asset editor
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.6 }}>
          ⌘/Ctrl+⇧+E
        </Typography>
      </Box>

      {!id || !t ? (
        <Typography variant="body2" sx={{ opacity: 0.8, py: 1 }}>
          Click an asset on the page to select it, then drag to move it. Selected
          assets outline gold.
        </Typography>
      ) : (
        <>
          <Typography variant="caption" sx={{ color: '#E0B860', display: 'block', mb: 0.5 }}>
            Editing: <b>{id}</b>
          </Typography>
          <Row label="Rotation" value={t.rot} min={-180} max={180} step={1} onChange={(v) => set({ rot: v })} fmt={(v) => `${v}°`} />
          <Row label="Width (scaleX)" value={t.sx} min={0.2} max={3} step={0.02} onChange={(v) => set({ sx: v })} fmt={(v) => v.toFixed(2)} />
          <Row label="Length (scaleY)" value={t.sy} min={0.2} max={3} step={0.02} onChange={(v) => set({ sy: v })} fmt={(v) => v.toFixed(2)} />
          <Row label="X" value={t.x} min={-400} max={400} step={1} onChange={(v) => set({ x: v })} fmt={(v) => `${v}px`} />
          <Row label="Y" value={t.y} min={-400} max={400} step={1} onChange={(v) => set({ y: v })} fmt={(v) => `${v}px`} />
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, mb: 0.5 }}>
            <Button size="small" variant="outlined" onClick={() => set({ sx: -t.sx })} sx={{ flex: 1, color: '#E0B860', borderColor: 'rgba(201,162,75,0.5)' }}>
              Flip H
            </Button>
            <Button size="small" variant="outlined" onClick={() => set({ sy: -t.sy })} sx={{ flex: 1, color: '#E0B860', borderColor: 'rgba(201,162,75,0.5)' }}>
              Flip V
            </Button>
            <Button size="small" variant="text" onClick={() => ed.resetOne(id)} sx={{ color: '#C9B68F' }}>
              Reset
            </Button>
          </Box>
        </>
      )}

      <Divider sx={{ my: 1, borderColor: 'rgba(201,162,75,0.25)' }} />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button size="small" variant="contained" onClick={copy} sx={{ flex: 1, bgcolor: '#9a6b2f', '&:hover': { bgcolor: '#b07d39' } }}>
          Copy layout
        </Button>
        <Button size="small" variant="text" onClick={ed.resetAll} sx={{ color: '#C9B68F' }}>
          Reset all
        </Button>
      </Box>
      <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.6, lineHeight: 1.3 }}>
        Drag assets to place; tune here. Copy layout and send it to me to bake in.
      </Typography>
    </Box>
  );
}
