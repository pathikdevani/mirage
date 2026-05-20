import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Editor, { type Monaco } from '@monaco-editor/react';
import { X } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../../api/client.js';
import { MONACO_AMBIENT_TYPES } from './lib/monacoTypes.js';
import { makeFnServerErrorHandler, type ServerError } from './lib/mapServerError.js';
import {
  NAME_RE,
  USAGES,
  USAGE_LABEL,
  type CreateCustomFunctionBody,
  type CustomFunction,
  type Usage,
} from './lib/types.js';

const STARTER_VALUE_GENERATOR = `// Return a value for one row.
// Available: ctx.faker, ctx.rng(), ctx.salt
return ctx.faker.person.firstName();`;

const STARTER_STRATEGY = `// Return one target id per source row.
// Available: ctx.sourceRows, ctx.targetRows, ctx.cardinality, ctx.rng(), ctx.salt
return ctx.sourceRows.map(() => ctx.targetRows[0].id);`;

interface Props {
  wsId: string;
  onClose: () => void;
  onCreated: (fn: CustomFunction) => void;
}

export function CreateFunctionModal({ wsId, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [usage, setUsage] = useState<Usage>('valueGenerator');
  const [source, setSource] = useState(STARTER_VALUE_GENERATOR);
  const [nameError, setNameError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [genericBanner, setGenericBanner] = useState<string | null>(null);

  // Swap the starter when the user hasn't typed yet.
  useEffect(() => {
    setSource((prev) => {
      if (prev === STARTER_VALUE_GENERATOR || prev === STARTER_STRATEGY) {
        return usage === 'strategy' ? STARTER_STRATEGY : STARTER_VALUE_GENERATOR;
      }
      return prev;
    });
  }, [usage]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const create = useMutation({
    mutationFn: async (body: CreateCustomFunctionBody): Promise<CustomFunction> => {
      const { data, error } = await bff.POST('/workspaces/{wsId}/custom-functions', {
        params: { path: { wsId } },
        body,
      });
      if (error) throw error as ServerError;
      if (!data) throw new Error('Empty response');
      return data;
    },
    onSuccess: async (fn) => {
      await queryClient.invalidateQueries({ queryKey: ['custom-functions', wsId] });
      onCreated(fn);
    },
    onError: makeFnServerErrorHandler({
      setNameError,
      setUsageError,
      setSourceError,
      setGenericBanner,
    }),
  });

  const beforeMount = (monaco: Monaco): void => {
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      MONACO_AMBIENT_TYPES,
      'mirage-ambient.d.ts',
    );
  };

  const canSubmit =
    NAME_RE.test(name) && source.length > 0 && source.length <= 20000 && !create.isPending;

  const submit = (): void => {
    const body: CreateCustomFunctionBody = {
      name,
      ...(description.trim() ? { description: description.trim() } : {}),
      usage,
      source,
    };
    create.mutate(body);
  };

  return (
    <div className="fixed inset-0 z-30 flex">
      <button
        type="button"
        aria-label="Close"
        className="flex-1 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="flex h-full w-full max-w-[860px] flex-col border-l border-border bg-card shadow-2xl md:w-[860px]">
        <header className="flex flex-none items-start gap-3 border-b border-border px-5 py-4">
          <div className="flex-1">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">
              New custom function
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              JavaScript saved as a function expression. Sandbox executes it later.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-none flex-col gap-3 border-b border-border px-5 py-4">
          <div className="grid grid-cols-[1fr_320px] gap-4">
            <label>
              <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
                Name
              </span>
              <input
                className={cn(
                  'mt-1 h-9 w-full rounded-md border bg-background px-3 font-mono text-[13px] text-foreground',
                  nameError ? 'border-destructive' : 'border-input',
                )}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
                placeholder="randomEmail"
              />
              {nameError && (
                <span className="mt-1 block text-[11.5px] text-destructive">{nameError}</span>
              )}
            </label>
            <label>
              <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
                Usage
              </span>
              <div className="mt-1 inline-flex rounded-md border border-input bg-background p-0.5">
                {USAGES.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => {
                      setUsage(u as Usage);
                      setUsageError(null);
                    }}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                      usage === u
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
          </div>
          <label>
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Description
            </span>
            <input
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this function do?"
            />
          </label>
        </div>

        {sourceError && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-[12.5px] text-destructive">
            <span className="flex-1 font-mono">{sourceError}</span>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <Editor
            height="100%"
            defaultLanguage="javascript"
            theme="vs-dark"
            beforeMount={beforeMount}
            value={source}
            onChange={(v) => {
              setSource(v ?? '');
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

        <footer className="flex flex-none items-center gap-3 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <span className="ml-auto text-[12px] text-muted-foreground">
            {source.length}/20000 chars
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={cn(
              'h-9 rounded-md bg-primary px-4 text-[12.5px] font-medium text-primary-foreground',
              !canSubmit ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90',
            )}
          >
            {create.isPending ? 'Creating…' : 'Create function'}
          </button>
        </footer>

        {genericBanner && (
          <div className="absolute bottom-16 left-5 right-5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {genericBanner}
          </div>
        )}
      </div>
    </div>
  );
}
