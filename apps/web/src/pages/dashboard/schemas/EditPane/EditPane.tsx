import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { bff } from '../../../../api/client.js';
import type { Schema, SchemaProp } from '../lib/types.js';
import { countTreeStats } from '../lib/treeStats.js';
import { validateTree, type ValidationIssue } from '../lib/validateTree.js';
import {
  makeServerErrorHandler,
  type ServerError,
} from '../lib/mapServerError.js';
import { PropertyEditor } from '../PropertyEditor/PropertyEditor.js';
import { SchemaHeaderInline } from './SchemaHeaderInline.js';
import { PropDetailDrawer } from './PropDetailDrawer.js';
import { SaveBar, type SaveBarBanner } from './SaveBar.js';
import { useSchemaBuffer } from './useSchemaBuffer.js';

export interface EditPaneProps {
  schema: Schema;
  workspaceSchemas: Schema[];
  wsId: string;
  onDirtyChange?: (dirty: boolean) => void;
  onDeleted?: () => void;
  onSelectReferrer?: (key: string) => void;
}

export function EditPane({
  schema,
  workspaceSchemas,
  wsId,
  onDirtyChange,
  onDeleted,
  onSelectReferrer,
}: EditPaneProps) {
  const queryClient = useQueryClient();
  const buffer = useSchemaBuffer(schema);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Error / banner state
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, ValidationIssue>>(new Map());
  const [keyError, setKeyError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [cycleBanner, setCycleBanner] = useState<string | null>(null);
  const [genericBanner, setGenericBanner] = useState<string | null>(null);
  const [staleBanner, setStaleBanner] = useState<{ currentUpdatedAt: string } | null>(null);
  const [rewriteBanner, setRewriteBanner] = useState<{ cycle?: string[] } | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<{ referrers: string[] } | null>(null);

  const availableKeys = useMemo(
    () => new Set(workspaceSchemas.map((s) => s.key)),
    [workspaceSchemas],
  );

  const liveIssues = useMemo(
    () => validateTree(buffer.draft.properties, availableKeys),
    [buffer.draft.properties, availableKeys],
  );
  const hasBlockingErrors =
    liveIssues.length > 0 ||
    buffer.draft.properties.length === 0 ||
    Boolean(keyError) ||
    Boolean(nameError);

  const changes = useMemo(
    () => buffer.diff(workspaceSchemas),
    [buffer, workspaceSchemas],
  );

  const stats = useMemo(() => countTreeStats(buffer.draft.properties), [buffer.draft.properties]);

  useEffect(() => {
    onDirtyChange?.(buffer.isDirty);
  }, [buffer.isDirty, onDirtyChange]);

  // Clear selection when its target disappears from the draft.
  const selectedProp = useMemo(
    () => (selectedPath ? buffer.getByPath(selectedPath) : null),
    [selectedPath, buffer],
  );
  useEffect(() => {
    if (selectedPath && !selectedProp) setSelectedPath(null);
  }, [selectedPath, selectedProp]);

  const mapServerError = useMemo(
    () =>
      makeServerErrorHandler({
        setNameError,
        setKeyError,
        setRowErrors,
        setCycleBanner,
        setGenericBanner,
        setStaleUpdate: (current) =>
          setStaleBanner(current !== null ? { currentUpdatedAt: current } : null),
        setKeyRewriteFailed: (detail) => setRewriteBanner(detail),
      }),
    [],
  );

  const clearTransientErrors = (): void => {
    setRowErrors(new Map());
    setKeyError(null);
    setNameError(null);
    setCycleBanner(null);
    setGenericBanner(null);
    setStaleBanner(null);
    setRewriteBanner(null);
  };

  const save = useMutation({
    mutationFn: async (): Promise<Schema> => {
      const body = {
        key: buffer.draft.key,
        name: buffer.draft.name,
        ...(buffer.draft.description ? { description: buffer.draft.description } : {}),
        color: buffer.draft.color,
        icon: buffer.draft.icon,
        tags: buffer.draft.tags,
        properties: buffer.draft.properties,
        expectedUpdatedAt: buffer.original.updatedAt,
      };
      const { data, error } = await bff.PUT('/workspaces/{wsId}/schemas/{id}', {
        params: { path: { wsId, id: schema.id } },
        body,
      });
      if (error) throw error as ServerError;
      if (!data) throw new Error('Empty response');
      return data;
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['schemas', wsId] });
      queryClient.setQueryData(['schema', wsId, schema.id], updated);
      // Reseed both baseline and draft so SaveBar disappears.
      buffer.setOriginal(updated);
      buffer.setDraft(structuredClone(updated));
      clearTransientErrors();
    },
    onError: (e: ServerError) => mapServerError(e),
  });

  const remove = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await bff.DELETE('/workspaces/{wsId}/schemas/{id}', {
        params: { path: { wsId, id: schema.id } },
      });
      if (error) throw error as { code?: string; detail?: { referrers?: string[] } };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemas', wsId] });
      onDeleted?.();
    },
    onError: (err: { code?: string; detail?: { referrers?: string[] } }) => {
      if (err?.code === 'ref_in_use' && err.detail?.referrers) {
        setDeleteError({ referrers: err.detail.referrers });
      }
    },
  });

  const refetchAndReseed = async (): Promise<void> => {
    const { data } = await bff.GET('/workspaces/{wsId}/schemas/{id}', {
      params: { path: { wsId, id: schema.id } },
    });
    if (data) {
      buffer.setOriginal(data);
      setStaleBanner(null);
    }
  };

  const handleHeaderChange: Parameters<typeof SchemaHeaderInline>[0]['onChange'] = (patch) => {
    setKeyError(null);
    setNameError(null);
    buffer.setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleDrawerChange = (next: SchemaProp): void => {
    if (!selectedPath || !selectedProp) return;
    const prevName = selectedProp.name;
    buffer.updateByPath(selectedPath, () => next);
    if (next.name !== prevName) {
      const idx = selectedPath.lastIndexOf('.');
      const parent = idx >= 0 ? selectedPath.slice(0, idx) : '';
      setSelectedPath(parent ? `${parent}.${next.name}` : next.name);
    }
  };

  const handleDrawerDuplicate = (): void => {
    if (!selectedPath) return;
    const newPath = buffer.duplicateByPath(selectedPath);
    if (newPath) setSelectedPath(newPath);
  };

  const handleDrawerRemove = (): void => {
    if (!selectedPath) return;
    buffer.removeByPath(selectedPath);
    setSelectedPath(null);
  };

  const banner: SaveBarBanner | null = staleBanner
    ? {
        kind: 'stale',
        message: 'This schema was updated elsewhere.',
        action: { label: 'Reload latest', onClick: () => void refetchAndReseed() },
      }
    : rewriteBanner
      ? {
          kind: 'rewrite_failed',
          message: `Renaming would introduce a cycle${
            rewriteBanner.cycle?.length ? `: ${rewriteBanner.cycle.join(' → ')}` : ''
          }.`,
        }
      : null;

  return (
    <section className="relative flex h-full flex-col overflow-hidden bg-background">
      <SchemaHeaderInline
        draft={buffer.draft}
        onChange={handleHeaderChange}
        nameError={nameError}
        keyError={keyError}
        onRequestDelete={() => setConfirmingDelete(true)}
      />

      <div className="flex flex-none items-center gap-4 border-b border-border bg-background px-4 py-2.5">
        <div className="text-[12px] text-muted-foreground">
          <b className="text-foreground">{stats.total}</b> fields ·{' '}
          <b className="text-foreground">{stats.required}</b> required ·{' '}
          <b className="text-brand-violet">{stats.refs}</b> refs · max depth{' '}
          <b className="text-foreground">{stats.maxDepth}</b>
        </div>
        <div className="ml-auto">
          <span className="rounded-md border-b-2 border-foreground px-1 pb-1 text-[12px] font-medium text-foreground">
            Properties
          </span>
        </div>
      </div>

      {cycleBanner && (
        <div className="flex-none border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-[12px] text-destructive">
          {cycleBanner}
        </div>
      )}
      {genericBanner && (
        <div className="flex-none border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-[12px] text-destructive">
          {genericBanner}
        </div>
      )}

      {deleteError && (
        <div className="flex flex-none items-start gap-3 border-b border-destructive/40 bg-destructive/5 px-4 py-3 text-[12.5px]">
          <div className="flex-1">
            <div className="font-medium text-destructive">
              Cannot delete — referenced by other schemas
            </div>
            <div className="mt-1 text-muted-foreground">
              Delete or update these first:{' '}
              {deleteError.referrers.map((k, i) => (
                <span key={k}>
                  <button
                    type="button"
                    onClick={() => onSelectReferrer?.(k)}
                    className="font-mono text-foreground underline decoration-dotted underline-offset-2 hover:text-brand-violet"
                  >
                    {k}
                  </button>
                  {i < deleteError.referrers.length - 1 && ', '}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="relative flex-1 overflow-y-auto px-4 py-3">
        <PropertyEditor
          rows={buffer.draft.properties}
          setRows={(rows) => buffer.setDraft((prev) => ({ ...prev, properties: rows }))}
          availableKeys={availableKeys}
          workspaceSchemas={workspaceSchemas}
          rowErrors={rowErrors}
          selectedPath={selectedPath}
          onSelectPath={setSelectedPath}
        />

        <PropDetailDrawer
          open={Boolean(selectedProp)}
          prop={selectedProp}
          workspaceSchemas={workspaceSchemas}
          onChange={handleDrawerChange}
          onDuplicate={handleDrawerDuplicate}
          onRemove={handleDrawerRemove}
          onClose={() => setSelectedPath(null)}
        />
      </div>

      <SaveBar
        dirty={buffer.isDirty}
        changes={changes}
        saving={save.isPending}
        hasBlockingErrors={hasBlockingErrors}
        onDiscard={() => {
          buffer.reset();
          setSelectedPath(null);
          clearTransientErrors();
        }}
        onSave={() => save.mutate()}
        banner={banner}
      />

      {confirmingDelete && (
        <ConfirmDeleteModal
          schemaKey={schema.key}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            remove.mutate();
          }}
        />
      )}
    </section>
  );
}

function ConfirmDeleteModal({
  schemaKey,
  onCancel,
  onConfirm,
}: {
  schemaKey: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
        <h3 className="text-[15px] font-semibold text-foreground">
          Delete <span className="font-mono">{schemaKey}</span>?
        </h3>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          This cannot be undone. Any data generated from this schema is unaffected.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-md bg-destructive px-3 text-[12.5px] font-medium text-destructive-foreground hover:opacity-90"
          >
            <Trash2 size={12} className="mr-1 inline" /> Delete schema
          </button>
        </div>
      </div>
    </div>
  );
}
