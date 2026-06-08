import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/** Per-asset visual transform (applied as a CSS transform, non-destructive). */
export interface Transform {
  x: number; // translate px
  y: number;
  rot: number; // degrees
  sx: number; // scaleX (width)
  sy: number; // scaleY (length/height)
}

export const IDENTITY: Transform = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };

interface EditorState {
  active: boolean;
  overrides: Record<string, Transform>;
  selectedId: string | null;
  registered: string[];
  toggle: () => void;
  select: (id: string | null) => void;
  register: (id: string) => void;
  update: (id: string, patch: Partial<Transform>) => void;
  resetOne: (id: string) => void;
  resetAll: () => void;
  exportJson: () => string;
}

const Ctx = createContext<EditorState | null>(null);
export const useEditor = () => useContext(Ctx);

const LS_OVERRIDES = 'editorOverrides';
const LS_ACTIVE = 'editorActive';

export function EditorProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).has('edit')) return true;
    return localStorage.getItem(LS_ACTIVE) === '1';
  });
  const [overrides, setOverrides] = useState<Record<string, Transform>>(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_OVERRIDES) || '{}');
    } catch {
      return {};
    }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registered, setRegistered] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem(LS_OVERRIDES, JSON.stringify(overrides));
  }, [overrides]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setActive((a) => {
          const next = !a;
          localStorage.setItem(LS_ACTIVE, next ? '1' : '0');
          if (!next) setSelectedId(null);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const register = useCallback((id: string) => {
    setRegistered((r) => (r.includes(id) ? r : [...r, id]));
  }, []);
  const update = useCallback((id: string, patch: Partial<Transform>) => {
    setOverrides((o) => ({ ...o, [id]: { ...IDENTITY, ...o[id], ...patch } }));
  }, []);
  const resetOne = useCallback((id: string) => {
    setOverrides((o) => {
      const next = { ...o };
      delete next[id];
      return next;
    });
  }, []);
  const resetAll = useCallback(() => setOverrides({}), []);
  const exportJson = useCallback(() => JSON.stringify(overrides, null, 2), [overrides]);

  return (
    <Ctx.Provider
      value={{
        active,
        overrides,
        selectedId,
        registered,
        toggle: () => setActive((a) => !a),
        select: setSelectedId,
        register,
        update,
        resetOne,
        resetAll,
        exportJson,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
