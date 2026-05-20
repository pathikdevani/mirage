import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Editor, { type Monaco } from '@monaco-editor/react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../../api/client.js';
import { MONACO_AMBIENT_TYPES } from './lib/monacoTypes.js';
import { makeFnServerErrorHandler, type ServerError } from './lib/mapServerError.js';
import {
  USAGES,
  USAGE_LABEL,
  type CustomFunction,
  type UpdateCustomFunctionBody,
  type Usage,
} from './lib/types.js';
import { useFunctionBuffer } from './useFunctionBuffer.js';

interface EditPaneProps {
  wsId: string;
  fn: CustomFunction;
  onDirtyChange: (dirty: boolean) => void;
  onDeleted: () => void;
}

export function EditPane({ wsId, fn, onDirtyChange, onDeleted }: EditPaneProps) {
  const queryClient = useQueryClient();
  const buffer = useFunctionBuffer(fn);
  const [genericBanner, setGenericBanner] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    onDirtyChange(buffer.isDirty);
  }, [buffer.isDirty, onDirtyChange]);

  const save = useMutation({
    mutationFn: async (): Promise<CustomFunction> => {
      const body: UpdateCustomFunctionBody = {
        name: buffer.draft.name,
        ...(buffer.draft.description ? { description: buffer.draft.description } : {}),
        usage: buffer.draft.usage,
        source: buffer.draft.source,
        expectedUpdatedAt: buffer.original.updatedAt,
      };
      const { data, error } = await bff.PUT('/workspaces/{wsId}/custom-functions/{id}', {
        params: { path: { wsId, id: fn.id } },
        body,
      });
      if (error) throw error as ServerError;
      if (!data) throw new Error('Empty response');
      return data;
    },
    onSuccess: async (next) => {
      buffer.setOriginal(next);
      buffer.setDraft(next);
      setGenericBanner(null);
      setNameError(null);
      setUsageError(null);
      setSourceError(null);
      await queryClient.invalidateQueries({ queryKey: ['custom-functions', wsId] });
      await queryClient.invalidateQueries({ queryKey: ['custom-function', wsId, fn.id] });
    },
    onError: makeFnServerErrorHandler({
      setNameError,
      setUsageError,
      setSourceError,
      setGenericBanner,
    }),
  });

  const del = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await bff.DELETE('/workspaces/{wsId}/custom-functions/{id}', {
        params: { path: { wsId, id: fn.id } },
      });
      if (error) throw error as ServerError;
    },
    onSuccess: async () => {
      onDirtyChange(false);
      await queryClient.invalidateQueries({ queryKey: ['custom-functions', wsId] });
      onDeleted();
    },
    onError: (e: ServerError) => {
      setGenericBanner(e.error ?? 'Failed to delete function.');
    },
  });

  const beforeMount = (monaco: Monaco): void => {
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      MONACO_AMBIENT_TYPES,
      'mirage-ambient.d.ts',
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-none flex-col gap-3 border-b border-border px-6 py-4">
        <div className="flex items-start gap-4">
          <label className="flex-1">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Name
            </span>
            <input
              className={cn(
                'mt-1 h-9 w-full rounded-md border bg-background px-3 font-mono text-[13px] text-foreground',
                nameError ? 'border-destructive' : 'border-input',
              )}
              value={buffer.draft.name}
              onChange={(e) => {
                buffer.setDraft((d) => ({ ...d, name: e.target.value }));
                setNameError(null);
              }}
            />
            {nameError && <span className="mt-1 text-[11.5px] text-destructive">{nameError}</span>}
          </label>
          <label className="w-72">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Usage
            </span>
            <div className="mt-1 inline-flex rounded-md border border-input bg-background p-0.5">
              {USAGES.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    buffer.setDraft((d) => ({ ...d, usage: u as Usage }));
                    setUsageError(null);
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                    buffer.draft.usage === u
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {USAGE_LABEL[u]}
                </button>
              ))}
            </div>
            {usageError && (
              <span className="mt-1 block text-[11.5px] text-destructive">{usageError}</span>
            )}
          </label>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="ml-auto h-9 self-end rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-destructive hover:bg-accent"
          >
            Delete
          </button>
        </div>
        <label>
          <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </span>
          <input
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
            value={buffer.draft.description}
            onChange={(e) => buffer.setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="What does this function do?"
          />
        </label>
      </header>

      {genericBanner && (
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-[12.5px] text-destructive">
          <AlertTriangle size={13} />
          <span className="flex-1">{genericBanner}</span>
          <button
            type="button"
            onClick={() => setGenericBanner(null)}
            className="text-destructive hover:opacity-70"
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {sourceError && (
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-[12.5px] text-destructive">
          <AlertTriangle size={13} />
          <span className="flex-1 font-mono">{sourceError}</span>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          beforeMount={beforeMount}
          value={buffer.draft.source}
          onChange={(v) => {
            buffer.setDraft((d) => ({ ...d, source: v ?? '' }));
            setSourceError(null);
          }}
          options={{
            minimap: { enabled: false },
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>

      {buffer.isDirty && (
        <footer className="flex flex-none items-center gap-3 border-t border-border bg-card px-6 py-3">
          <span className="text-[12.5px] text-muted-foreground">You have unsaved changes</span>
          <span className="ml-auto" />
          <button
            type="button"
            onClick={buffer.reset}
            disabled={save.isPending}
            className="h-8 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="h-8 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      )}

      {confirmingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            <h3 className="text-[15px] font-semibold text-foreground">
              Delete &quot;{fn.name}&quot;?
            </h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              If any schema or set still references this function, deletion will fail with a listing
              of what blocks it.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={del.isPending}
                className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  del.mutate();
                }}
                disabled={del.isPending}
                className="h-9 rounded-md bg-destructive px-3 text-[12.5px] font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {del.isPending ? 'Deleting…' : 'Delete function'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
