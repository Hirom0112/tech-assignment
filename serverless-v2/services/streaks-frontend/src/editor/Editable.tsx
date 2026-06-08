import { useEffect, useRef, type ReactNode } from 'react';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import { useEditor, IDENTITY } from './EditorContext';

interface EditableProps {
  /** Stable unique id for this asset (used to key its transform). */
  id: string;
  /** Short human label shown in the editor toolbar. */
  label?: string;
  children: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * Wraps an asset so the visual editor (Cmd/Ctrl+Shift+E) can select it and
 * move / rotate / scale / flip it — applied as a non-destructive CSS transform
 * (doesn't reflow siblings). Drag to reposition; the toolbar handles rotation,
 * width (scaleX), length (scaleY), and flips. Outside edit mode it's an inert
 * passthrough, so normal clicks (e.g. on buttons) work untouched.
 */
export default function Editable({ id, label, children, sx }: EditableProps) {
  const ed = useEditor();
  const t = ed?.overrides[id] ?? IDENTITY;
  const active = !!ed?.active;
  const selected = ed?.selectedId === id;
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (ed) ed.register(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!ed]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!active || !ed) return; // inert when not editing → clicks pass through
    e.stopPropagation();
    e.preventDefault();
    ed.select(id);
    drag.current = { px: e.clientX, py: e.clientY, ox: t.x, oy: t.y };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !ed) return;
    ed.update(id, {
      x: drag.current.ox + (e.clientX - drag.current.px),
      y: drag.current.oy + (e.clientY - drag.current.py),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <Box
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      data-editable-id={id}
      data-editable-label={label || id}
      sx={{
        display: 'inline-flex',
        transform: `translate(${t.x}px, ${t.y}px) rotate(${t.rot}deg) scale(${t.sx}, ${t.sy})`,
        transformOrigin: 'center',
        transition: active ? 'none' : 'transform 120ms ease',
        cursor: active ? 'move' : 'inherit',
        outline: active
          ? selected
            ? '2px solid #E0B860'
            : '1px dashed rgba(224,184,96,0.5)'
          : 'none',
        outlineOffset: 2,
        position: 'relative',
        zIndex: selected ? 5 : 'auto',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
