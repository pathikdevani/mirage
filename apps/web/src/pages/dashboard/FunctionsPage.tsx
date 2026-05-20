import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { Code2, Plus } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../api/client.js';
import { ListPane } from './functions/ListPane.js';
import { EditPane } from './functions/EditPane.js';
import { UsagePane } from './functions/UsagePane.js';
import { CreateFunctionModal } from './functions/CreateFunctionModal.js';
import type { CustomFunction } from './functions/lib/types.js';

export function FunctionsPage() {
  const { wsId } = useParams<{ wsId: string }>();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [pendingNavId, setPendingNavId] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const activeId = params.get('active');

  const list = useQuery({
    enabled: Boolean(wsId),
    queryKey: ['custom-functions', wsId],
    queryFn: async (): Promise<CustomFunction[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/custom-functions', {
        params: { path: { wsId: wsId! } },
      });
      if (error) throw error;
      return (data ?? []) as CustomFunction[];
    },
    staleTime: 30_000,
  });

  const active = useQuery({
    enabled: Boolean(wsId && activeId),
    queryKey: ['custom-function', wsId, activeId],
    queryFn: async (): Promise<CustomFunction> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/custom-functions/{id}', {
        params: { path: { wsId: wsId!, id: activeId! } },
      });
      if (error) throw error;
      return data!;
    },
    staleTime: 30_000,
  });

  const fns = list.data ?? [];

  const activeFn = useMemo<CustomFunction | null>(() => {
    if (active.data) return active.data;
    return fns.find((f) => f.id === activeId) ?? null;
  }, [active.data, fns, activeId]);

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
    if (!activeId && fns.length > 0) {
      commitSelect(fns[0]!.id);
    }
    if (activeId && fns.length > 0 && !fns.some((f) => f.id === activeId)) {
      commitSelect(null);
    }
  }, [activeId, fns]);

  const isEmpty = !list.isLoading && fns.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center justify-between border-b border-border px-8 py-5">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            Functions
          </h1>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">
            {fns.length}
          </span>
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus size={14} strokeWidth={2.5} />
            New function
          </button>
        )}
      </div>

      {list.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
          Loading functions…
        </div>
      ) : isEmpty ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr_320px]">
          <ListPane functions={fns} activeId={activeId} onSelect={requestSelect} />
          <div className="min-h-0">
            {activeFn ? (
              <EditPane
                key={activeFn.id}
                wsId={wsId!}
                fn={activeFn}
                onDirtyChange={(d) => {
                  dirtyRef.current = d;
                }}
                onDeleted={() => {
                  dirtyRef.current = false;
                  commitSelect(null);
                  queryClient.invalidateQueries({ queryKey: ['custom-functions', wsId] });
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                Select a function from the left
              </div>
            )}
          </div>
          {activeFn ? (
            <UsagePane wsId={wsId!} functionId={activeFn.id} />
          ) : (
            <div className="border-l border-border bg-card" />
          )}
        </div>
      )}

      {creating && (
        <CreateFunctionModal
          wsId={wsId!}
          onClose={() => setCreating(false)}
          onCreated={(f) => {
            setCreating(false);
            commitSelect(f.id);
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
        <Code2 size={32} strokeWidth={1.5} className={cn('text-muted-foreground')} />
      </span>
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">
        Reach beyond faker
      </h2>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        Custom Functions are workspace-level JavaScript that can power a Schema property or a Set
        Strategy.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"
      >
        <Plus size={14} strokeWidth={2.5} />
        New function
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
          You have unsaved changes to this function. Switching now will discard them.
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
