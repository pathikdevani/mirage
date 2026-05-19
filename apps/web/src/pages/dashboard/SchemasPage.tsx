import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { Database, Plus } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../api/client.js';
import { ListPane } from './schemas/ListPane.js';
import { ViewerPane } from './schemas/ViewerPane.js';
import { PreviewPane } from './schemas/PreviewPane.js';
import { CreateSchemaSheet } from './schemas/CreateSchemaSheet/index.js';
import type { Schema } from './schemas/lib/types.js';

export function SchemasPage() {
  const { wsId } = useParams<{ wsId: string }>();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [deleteError, setDeleteError] = useState<{ id: string; referrers: string[] } | null>(null);

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
    queryKey: ['schemas', wsId],
    queryFn: async (): Promise<Schema[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/schemas', {
        params: { path: { wsId: wsId! } },
      });
      if (error) throw error;
      return (data ?? []) as Schema[];
    },
    staleTime: 30_000,
  });

  const active = useQuery({
    enabled: Boolean(wsId && activeId),
    queryKey: ['schema', wsId, activeId],
    queryFn: async (): Promise<Schema> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/schemas/{id}', {
        params: { path: { wsId: wsId!, id: activeId! } },
      });
      if (error) throw error;
      return data!;
    },
    staleTime: 30_000,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await bff.DELETE('/workspaces/{wsId}/schemas/{id}', {
        params: { path: { wsId: wsId!, id } },
      });
      if (error) throw error as { code?: string; detail?: { referrers?: string[] } };
      return id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['schemas', wsId] });
      if (activeId === id) {
        const next = new URLSearchParams(params);
        next.delete('active');
        setParams(next, { replace: true });
      }
      setDeleteError(null);
    },
    onError: (err: { code?: string; detail?: { referrers?: string[] } }, id) => {
      if (err?.code === 'ref_in_use' && err.detail?.referrers) {
        setDeleteError({ id, referrers: err.detail.referrers });
      }
    },
  });

  const schemas = list.data ?? [];

  // Auto-select first schema when none selected.
  useEffect(() => {
    if (!activeId && schemas.length > 0) {
      const next = new URLSearchParams(params);
      next.set('active', schemas[0]!.id);
      setParams(next, { replace: true });
    }
  }, [activeId, schemas, params, setParams]);

  const activeSchema = useMemo<Schema | null>(() => {
    if (active.data) return active.data;
    return schemas.find((s) => s.id === activeId) ?? null;
  }, [active.data, schemas, activeId]);

  const selectSchema = (id: string): void => {
    const next = new URLSearchParams(params);
    next.set('active', id);
    setParams(next, { replace: true });
    setDeleteError(null);
  };

  const selectByKey = (key: string): void => {
    const target = schemas.find((s) => s.key === key);
    if (target) selectSchema(target.id);
  };

  const isEmpty = !list.isLoading && schemas.length === 0;
  const wsName = workspace.data?.name ?? '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center justify-between border-b border-border px-8 py-5">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            Schemas
          </h1>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">
            {schemas.length}
          </span>
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus size={14} strokeWidth={2.5} />
            New schema
          </button>
        )}
      </div>

      {list.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
          Loading schemas…
        </div>
      ) : isEmpty ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr_320px]">
          <ListPane
            schemas={schemas}
            activeId={activeId}
            onSelect={selectSchema}
          />
          <div className="min-h-0">
            {activeSchema ? (
              <ViewerPane
                schema={activeSchema}
                onDelete={() => remove.mutate(activeSchema.id)}
                deleteError={
                  deleteError && deleteError.id === activeSchema.id
                    ? { referrers: deleteError.referrers }
                    : null
                }
                onClearDeleteError={() => setDeleteError(null)}
                onSelectReferrer={selectByKey}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                Select a schema from the left
              </div>
            )}
          </div>
          <PreviewPane wsId={wsId!} />
        </div>
      )}

      {creating && (
        <CreateSchemaSheet
          wsId={wsId!}
          workspaceName={wsName}
          workspaceSchemas={schemas}
          onClose={() => setCreating(false)}
          onCreated={(s) => {
            setCreating(false);
            selectSchema(s.id);
          }}
        />
      )}
    </div>
  );
}

interface EmptyStateProps {
  onCreate: () => void;
}

function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Database
          size={32}
          strokeWidth={1.5}
          className={cn('text-muted-foreground')}
        />
      </span>
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">
        Define your first data shape
      </h2>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        Schemas tell Mirage how to generate each row.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"
      >
        <Plus size={14} strokeWidth={2.5} />
        New schema
      </button>
    </div>
  );
}
