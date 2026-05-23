import { useState, type ChangeEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { MAX_ROWS_PER_SCHEMA } from '@mirage/engine';
import { bff } from '../../../api/client.js';
import { OUTPUT_FORMATS, type MirageSet, type SetSchemaInclusion } from './lib/types.js';
import { IconByName } from './lib/icon.js';
import { BRAND_COLOR_BG } from './lib/colors.js';
import type { SetBuffer } from './useSetBuffer.js';
import type { Api } from '@mirage/types';

type Schema = Api.components['schemas']['Schema'];

interface ConfigTabProps {
  wsId: string;
  buffer: SetBuffer;
  nameError: string | null;
  keyError: string | null;
  schemasError: string | null;
  outputError: string | null;
  onClearError: () => void;
}

export function ConfigTab({
  wsId,
  buffer,
  nameError,
  keyError,
  schemasError,
  outputError,
  onClearError,
}: ConfigTabProps) {
  const workspaceSchemas = useQuery({
    queryKey: ['schemas', wsId],
    queryFn: async (): Promise<Schema[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/schemas', {
        params: { path: { wsId } },
      });
      if (error) throw error;
      return (data ?? []) as Schema[];
    },
    staleTime: 30_000,
  });

  const draft = buffer.draft;
  const schemas = workspaceSchemas.data ?? [];
  const byKey = new Map(schemas.map((s) => [s.key, s]));
  const includedKeys = new Set(draft.schemas.map((i) => i.schemaKey));
  const available = schemas.filter((s) => !includedKeys.has(s.key));
  const [showAdd, setShowAdd] = useState(false);

  const update = (mut: (next: MirageSet) => MirageSet): void => {
    buffer.setDraft((prev) => mut(structuredClone(prev)));
    onClearError();
  };

  const updateCount = (idx: number, v: string): void => {
    const n = Number.parseInt(v.replaceAll(/\D/g, '') || '0', 10);
    update((next) => {
      const inc = next.schemas[idx];
      if (inc) inc.count = Math.min(MAX_ROWS_PER_SCHEMA, Math.max(0, n));
      return next;
    });
  };

  const removeInclusion = (idx: number): void => {
    update((next) => {
      const removed = next.schemas[idx];
      next.schemas = next.schemas.filter((_, i) => i !== idx);
      if (removed) {
        next.strategies = next.strategies.filter((ov) => ov.schemaKey !== removed.schemaKey);
      }
      return next;
    });
  };

  const addInclusion = (schemaKey: string): void => {
    update((next) => {
      next.schemas = [...next.schemas, { schemaKey, count: 100 }];
      return next;
    });
    setShowAdd(false);
  };

  return (
    <div className="flex flex-col gap-4 p-8">
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <div className="flex-1">
            <h3 className="text-[14px] font-semibold text-foreground">Set details</h3>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-4 p-5">
          <FieldGroup label="Name" error={nameError}>
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
              value={draft.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                update((next) => {
                  next.name = e.target.value;
                  return next;
                })
              }
            />
          </FieldGroup>
          <FieldGroup label="Key" error={keyError}>
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-[13px] text-foreground"
              value={draft.key}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                update((next) => {
                  next.key = e.target.value;
                  return next;
                })
              }
            />
          </FieldGroup>
          <FieldGroup label="Description" wide>
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
              value={draft.description}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                update((next) => {
                  next.description = e.target.value;
                  return next;
                })
              }
            />
          </FieldGroup>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <div className="flex-1">
            <h3 className="text-[14px] font-semibold text-foreground">Schemas in this set</h3>
            <p className="text-[12px] text-muted-foreground">
              Each schema&rsquo;s row count is fixed per run. Cross-references appear in the
              Strategies tab.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            disabled={available.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-[12.5px] font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={13} /> Add schema
          </button>
        </header>

        {showAdd && available.length > 0 && (
          <div className="border-b border-border bg-muted/30 px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {available.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => addInclusion(s.key)}
                  className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1 text-[12px] font-medium text-foreground hover:bg-accent"
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded text-white',
                      BRAND_COLOR_BG[s.color],
                    )}
                  >
                    <IconByName name={s.icon} size={10} />
                  </span>
                  {s.key}
                </button>
              ))}
            </div>
          </div>
        )}

        {schemasError && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-[12.5px] text-destructive">
            {schemasError}
          </div>
        )}

        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2 font-medium">Schema</th>
              <th className="px-5 py-2 text-right font-medium">Records</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {draft.schemas.map((inc: SetSchemaInclusion, idx: number) => {
              const sch = byKey.get(inc.schemaKey);
              return (
                <tr
                  key={`${inc.schemaKey}-${idx}`}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {sch ? (
                        <>
                          <span
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded text-white',
                              BRAND_COLOR_BG[sch.color],
                            )}
                          >
                            <IconByName name={sch.icon} size={11} />
                          </span>
                          <div>
                            <div className="text-[13px] font-medium text-foreground">
                              {sch.name}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {sch.key}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="text-[12.5px] text-destructive">
                          Schema &quot;{inc.schemaKey}&quot; no longer exists
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <input
                      type="text"
                      inputMode="numeric"
                      className="h-8 w-32 rounded-md border border-input bg-background px-2 text-right font-mono text-[13px] text-foreground"
                      value={inc.count.toLocaleString()}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        updateCount(idx, e.target.value)
                      }
                    />
                  </td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => removeInclusion(idx)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                      aria-label={`Remove ${inc.schemaKey}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <div className="flex-1">
            <h3 className="text-[14px] font-semibold text-foreground">Output</h3>
            <p className="text-[12px] text-muted-foreground">
              Where rows are emitted. Connector + format may be overridden at export time.
            </p>
          </div>
        </header>
        <div className="grid grid-cols-3 gap-4 p-5">
          <FieldGroup label="Format" error={outputError}>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
              value={draft.output.format}
              onChange={(e) =>
                update((next) => {
                  next.output.format = e.target.value as (typeof OUTPUT_FORMATS)[number];
                  return next;
                })
              }
            >
              {OUTPUT_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Locale">
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-[13px] text-foreground"
              value={draft.output.locale}
              onChange={(e) =>
                update((next) => {
                  next.output.locale = e.target.value;
                  return next;
                })
              }
            />
          </FieldGroup>
          <FieldGroup label="Worker pool">
            <input
              type="number"
              min={1}
              max={64}
              className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-[13px] text-foreground"
              value={draft.output.workerPool}
              onChange={(e) =>
                update((next) => {
                  const v = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(v)) next.output.workerPool = Math.min(64, Math.max(1, v));
                  return next;
                })
              }
            />
          </FieldGroup>
        </div>
      </section>
    </div>
  );
}

function FieldGroup({
  label,
  children,
  error,
  wide,
}: {
  label: string;
  children: ReactNode;
  error?: string | null;
  wide?: boolean;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', wide && 'col-span-2')}>
      <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {error && <span className="text-[11.5px] text-destructive">{error}</span>}
    </label>
  );
}
