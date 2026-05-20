import { create } from 'zustand';

/**
 * Live run state per Set. Keyed by setId so navigating between Sets keeps each
 * card's progress isolated. WS events update this store via RunControl; new
 * mounts read from it instead of refetching.
 */

export type RunPhase =
  | { phase: 'idle' }
  | { phase: 'starting'; runId: string }
  | { phase: 'running'; runId: string; produced: number; total: number; startedAt: string }
  | {
      phase: 'completed';
      runId: string;
      rowCounts: Record<string, number>;
      endedAt: string;
      startedAt?: string;
    }
  | { phase: 'failed'; runId: string; message: string }
  | { phase: 'cancelled'; runId: string };

interface RunsState {
  setRuns: Record<string, RunPhase>;
  setRunState: (setId: string, next: RunPhase) => void;
  clearRunState: (setId: string) => void;
}

export const useRunsStore = create<RunsState>((set) => ({
  setRuns: {},
  setRunState: (setId, next) => set((s) => ({ setRuns: { ...s.setRuns, [setId]: next } })),
  clearRunState: (setId) =>
    set((s) => {
      const { [setId]: _drop, ...rest } = s.setRuns;
      return { setRuns: rest };
    }),
}));
