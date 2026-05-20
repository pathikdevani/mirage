import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, X, RotateCcw } from 'lucide-react';
import type { Api, RunEvent } from '@mirage/types';
import { bff } from '../../../api/client.js';
import { ws } from '../../../api/ws.js';
import { useRunsStore, type RunPhase } from '../../../state/runs.js';
import { RunStatusBadge } from '../../../components/RunStatusBadge.js';

type Run = Api.components['schemas']['Run'];
type RunListItem = Api.components['schemas']['RunListItem'];

interface Props {
  wsId: string;
  setId: string;
  onCompleted?: () => void;
}

const IDLE_PHASE: RunPhase = { phase: 'idle' };

function deriveSeed(latest: RunListItem | undefined): RunPhase {
  if (!latest) return { phase: 'idle' };
  if (latest.status === 'completed') {
    return {
      phase: 'completed',
      runId: latest.id,
      rowCounts: (latest.rowCounts ?? {}) as Record<string, number>,
      endedAt: latest.endedAt ?? latest.createdAt,
      ...(latest.startedAt ? { startedAt: latest.startedAt } : {}),
    };
  }
  if (latest.status === 'queued') return { phase: 'starting', runId: latest.id };
  if (latest.status === 'running') {
    return {
      phase: 'running',
      runId: latest.id,
      produced: 0,
      total: 0,
      startedAt: latest.startedAt ?? latest.createdAt,
    };
  }
  if (latest.status === 'failed') {
    return {
      phase: 'failed',
      runId: latest.id,
      message: latest.errorMessage ?? 'Run failed',
    };
  }
  if (latest.status === 'cancelled') return { phase: 'cancelled', runId: latest.id };
  return { phase: 'idle' };
}

export function RunControl({ wsId, setId, onCompleted }: Props) {
  const queryClient = useQueryClient();
  const state: RunPhase = useRunsStore((s): RunPhase => s.setRuns[setId] ?? IDLE_PHASE);
  const setRunState = useRunsStore((s) => s.setRunState);
  const completedFired = useRef<string | null>(null);

  useQuery({
    queryKey: ['runs', wsId, 'latest-for-set', setId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/runs', {
        params: { path: { wsId }, query: { setId, limit: 1 } },
      });
      if (error) throw error;
      const list = (data ?? []) as RunListItem[];
      const seed = deriveSeed(list[0]);
      const existing = useRunsStore.getState().setRuns[setId];
      if (!existing || existing.phase === 'idle') setRunState(setId, seed);
      return list[0] ?? null;
    },
    staleTime: 5_000,
  });

  const activeRunId =
    state.phase === 'starting' || state.phase === 'running' ? state.runId : null;

  useEffect(() => {
    if (!activeRunId) return;
    const off = ws.subscribe(activeRunId, (e: RunEvent) => {
      if (e.runId !== activeRunId) return;
      if (e.type === 'run.started') {
        setRunState(setId, {
          phase: 'running',
          runId: activeRunId,
          produced: 0,
          total: 0,
          startedAt: e.at,
        });
      } else if (e.type === 'run.progress') {
        const current = useRunsStore.getState().setRuns[setId];
        const startedAt = current && current.phase === 'running' ? current.startedAt : e.at;
        setRunState(setId, {
          phase: 'running',
          runId: activeRunId,
          produced: e.produced,
          total: e.total,
          startedAt,
        });
      } else if (e.type === 'run.completed') {
        setRunState(setId, {
          phase: 'completed',
          runId: activeRunId,
          rowCounts: e.rowCounts as Record<string, number>,
          endedAt: e.at,
        });
      } else if (e.type === 'run.failed') {
        setRunState(setId, { phase: 'failed', runId: activeRunId, message: e.message });
      } else if (e.type === 'run.cancelled') {
        setRunState(setId, { phase: 'cancelled', runId: activeRunId });
      }
    });
    return off;
  }, [activeRunId, setId, setRunState]);

  useEffect(() => {
    if (state.phase === 'completed' && completedFired.current !== state.runId) {
      completedFired.current = state.runId;
      onCompleted?.();
      void queryClient.invalidateQueries({
        queryKey: ['runs', wsId, 'latest-for-set', setId],
      });
      void queryClient.invalidateQueries({ queryKey: ['runs', wsId] });
    }
  }, [state, onCompleted, queryClient, wsId, setId]);

  const startRun = useMutation({
    mutationFn: async (): Promise<Run> => {
      const { data, error } = await bff.POST('/workspaces/{wsId}/sets/{id}/run', {
        params: { path: { wsId, id: setId } },
      });
      if (error) throw error;
      if (!data) throw new Error('Empty response');
      return data;
    },
    onSuccess: (run) => {
      setRunState(setId, { phase: 'starting', runId: run.id });
      void queryClient.invalidateQueries({
        queryKey: ['runs', wsId, 'latest-for-set', setId],
      });
    },
  });

  const cancelRun = useMutation({
    mutationFn: async (runId: string): Promise<void> => {
      const { error } = await bff.POST('/workspaces/{wsId}/runs/{id}/cancel', {
        params: { path: { wsId, id: runId } },
      });
      if (error) throw error;
    },
  });

  if (state.phase === 'idle') {
    return (
      <button
        type="button"
        onClick={() => startRun.mutate()}
        disabled={startRun.isPending}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        <Play size={14} strokeWidth={2.5} /> Run set
      </button>
    );
  }

  if (state.phase === 'starting') {
    return (
      <div className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground" />
        Queued…
      </div>
    );
  }

  if (state.phase === 'running') {
    const pct =
      state.total > 0 ? Math.min(100, Math.round((state.produced / state.total) * 100)) : 0;
    return (
      <div className="inline-flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-44 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {state.produced.toLocaleString()} / {state.total.toLocaleString()} rows
          </span>
        </div>
        <button
          type="button"
          onClick={() => cancelRun.mutate(state.runId)}
          disabled={cancelRun.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium text-foreground hover:bg-accent disabled:opacity-60"
        >
          <X size={14} /> Cancel
        </button>
      </div>
    );
  }

  if (state.phase === 'completed') {
    return (
      <div className="inline-flex items-center gap-2">
        <RunStatusBadge status="completed" />
        <button
          type="button"
          onClick={() => startRun.mutate()}
          disabled={startRun.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium text-foreground hover:bg-accent"
        >
          <RotateCcw size={13} /> Run again
        </button>
      </div>
    );
  }

  if (state.phase === 'failed') {
    return (
      <div className="inline-flex items-center gap-2">
        <RunStatusBadge status="failed" />
        <span
          className="max-w-[280px] truncate text-[12px] text-destructive"
          title={state.message}
        >
          {state.message}
        </span>
        <button
          type="button"
          onClick={() => startRun.mutate()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium text-foreground hover:bg-accent"
        >
          <RotateCcw size={13} /> Retry
        </button>
      </div>
    );
  }

  // cancelled
  return (
    <div className="inline-flex items-center gap-2">
      <RunStatusBadge status="cancelled" />
      <button
        type="button"
        onClick={() => startRun.mutate()}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium text-foreground hover:bg-accent"
      >
        <RotateCcw size={13} /> Run again
      </button>
    </div>
  );
}
