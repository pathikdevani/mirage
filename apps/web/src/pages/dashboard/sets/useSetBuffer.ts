import { useCallback, useMemo, useState } from 'react';
import type { MirageSet } from './lib/types.js';

export interface SetBuffer {
  original: MirageSet;
  draft: MirageSet;
  setDraft: (next: MirageSet | ((prev: MirageSet) => MirageSet)) => void;
  /** Replace the baseline without touching the draft. Used after a stale-update reload. */
  setOriginal: (next: MirageSet) => void;
  isDirty: boolean;
  reset: () => void;
}

export function useSetBuffer(initial: MirageSet): SetBuffer {
  const [original, setOriginalState] = useState<MirageSet>(initial);
  const [draft, setDraftState] = useState<MirageSet>(() => structuredClone(initial));

  const setDraft: SetBuffer['setDraft'] = useCallback((next) => {
    setDraftState((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);

  const setOriginal = useCallback((next: MirageSet) => {
    setOriginalState(next);
  }, []);

  const reset = useCallback(() => {
    setDraftState(structuredClone(original));
  }, [original]);

  const isDirty = useMemo(
    () => JSON.stringify(original) !== JSON.stringify(draft),
    [original, draft],
  );

  return { original, draft, setDraft, setOriginal, isDirty, reset };
}
