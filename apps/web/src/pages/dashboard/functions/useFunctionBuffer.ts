import { useCallback, useMemo, useState } from 'react';
import type { CustomFunction } from './lib/types.js';

export interface FunctionBuffer {
  original: CustomFunction;
  draft: CustomFunction;
  setDraft: (next: CustomFunction | ((prev: CustomFunction) => CustomFunction)) => void;
  setOriginal: (next: CustomFunction) => void;
  isDirty: boolean;
  reset: () => void;
}

export function useFunctionBuffer(initial: CustomFunction): FunctionBuffer {
  const [original, setOriginalState] = useState<CustomFunction>(initial);
  const [draft, setDraftState] = useState<CustomFunction>(() => structuredClone(initial));

  const setDraft: FunctionBuffer['setDraft'] = useCallback((next) => {
    setDraftState((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);

  const setOriginal = useCallback((next: CustomFunction) => {
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
