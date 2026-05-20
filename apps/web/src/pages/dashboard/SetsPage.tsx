import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { Box, Plus } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../api/client.js';
import { ListGrid } from './sets/ListGrid.js';
import { DetailPane } from './sets/DetailPane.js';
import { CreateSetSheet } from './sets/CreateSetSheet/index.js';
import type { MirageSet } from './sets/lib/types.js';

export function SetsPage() {
  const { wsId } = useParams<{ wsId: string }>();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [pendingNavId, setPendingNavId] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const activeId = params.get('active');

  const workspace = useQuery({
    enabled: Boolean(wsId),
    queryKey: ['workspace', wsId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{id}', {
        params: { path: { id: wsId! } },
      });
      if (error) throw error;
      return data!;
    },
  });

  const list = useQuery({
    enabled: Boolean(wsId),
    queryKey: ['sets', wsId],
    queryFn: async (): Promise<MirageSet[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/sets', {
        params: { path: { wsId: wsId! } },
      });
      if (error) throw error;
      return (data ?? []) as MirageSet[];
    },
    staleTime: 30_000,
  });

  const active = useQuery({
    enabled: Boolean(wsId && activeId),
    queryKey: ['set', wsId, activeId],
    queryFn: async (): Promise<MirageSet> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/sets/{id}', {
        params: { path: { wsId: wsId!, id: activeId! } },
      });
      if (error) throw error;
      return data!;
    },
    staleTime: 30_000,
  });

  const sets = list.data ?? [];

  const activeSet = useMemo<MirageSet | null>(() => {
    if (active.data) return active.data;
    return sets.find((s) => s.id === activeId) ?? null;
  }, [active.data, sets, activeId]);

  const commitSelect = (id: string | null): void => {
    const next = new URLSearchParams(params);
    if (id) next.set('active', id);
    else next.delete('active');
    setParams(next, { replace: true });
  };

  const requestSelect = (id: string | null): void => {
    if (id === activeId) return;
    if (dirtyRef.current && id) {
      setPendingNavId(id);
      return;
    }
    commitSelect(id);
  };

  useEffect(() => {
    if (activeId && sets.length > 0 && !sets.some((s) => s.id === activeId)) {
      commitSelect(null);
    }
  }, [activeId, sets]);

  const isEmpty = !list.isLoading && sets.length === 0;
  const wsName = workspace.data?.name ?? '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center justify-between border-b border-border px-8 py-5">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">Sets</h1>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">
            {sets.length}
          </span>
        </div>
        {!isEmpty && !activeId && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus size={14} strokeWidth={2.5} />
            New set
          </button>
        )}
        {activeId && (
          <button
            type="button"
            onClick={() => requestSelect(null)}
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            ← Back to list
          </button>
        )}
      </div>

      {list.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
          Loading sets…
        </div>
      ) : isEmpty ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : activeSet ? (
        <DetailPane
          key={activeSet.id}
          wsId={wsId!}
          set={activeSet}
          onDirtyChange={(d) => {
            dirtyRef.current = d;
          }}
          onDeleted={() => {
            dirtyRef.current = false;
            commitSelect(null);
            queryClient.invalidateQueries({ queryKey: ['sets', wsId] });
          }}
        />
      ) : (
        <ListGrid sets={sets} onOpen={requestSelect} onCreate={() => setCreating(true)} />
      )}

      {creating && (
        <CreateSetSheet
          wsId={wsId!}
          workspaceName={wsName}
          onClose={() => setCreating(false)}
          onCreated={(s) => {
            setCreating(false);
            commitSelect(s.id);
          }}
        />
      )}

      {pendingNavId && (
        <DiscardChangesModal
          onCancel={() => setPendingNavId(null)}
          onConfirm={() => {
            const target = pendingNavId;
            setPendingNavId(null);
            dirtyRef.current = false;
            commitSelect(target);
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Box size={32} strokeWidth={1.5} className={cn('text-muted-foreground')} />
      </span>
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">
        Bundle schemas to generate data
      </h2>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        A Set combines schemas with per-record counts and reference strategies into a reusable
        recipe.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"
      >
        <Plus size={14} strokeWidth={2.5} />
        New set
      </button>
    </div>
  );
}

function DiscardChangesModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
        <h3 className="text-[15px] font-semibold text-foreground">Discard unsaved changes?</h3>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          You have unsaved changes to this set. Switching now will discard them.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-md bg-destructive px-3 text-[12.5px] font-medium text-destructive-foreground hover:opacity-90"
          >
            Discard changes
          </button>
        </div>
      </div>
    </div>
  );
}
