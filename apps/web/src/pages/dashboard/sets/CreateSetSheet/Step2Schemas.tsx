import type { ChangeEvent } from 'react';
import { Check, Database, Plus, Trash2 } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { BRAND_COLOR_BG } from '../lib/colors.js';
import { IconByName } from '../lib/icon.js';
import type { SetSchemaInclusion } from '../lib/types.js';
import type { Api } from '@mirage/types';

type Schema = Api.components['schemas']['Schema'];

interface Step2Props {
  workspaceSchemas: Schema[];
  inclusions: SetSchemaInclusion[];
  setInclusions: (next: SetSchemaInclusion[]) => void;
  error?: string;
  showEmptyError?: boolean;
}

export function Step2Schemas({
  workspaceSchemas,
  inclusions,
  setInclusions,
  error,
  showEmptyError,
}: Step2Props) {
  const includedKeys = new Set(inclusions.map((i) => i.schemaKey));
  const available = workspaceSchemas.filter((s) => !includedKeys.has(s.key));

  if (workspaceSchemas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Database size={32} strokeWidth={1.5} className="text-muted-foreground" />
        <h3 className="text-[15px] font-semibold text-foreground">No schemas yet</h3>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Define at least one schema before you can build a set.
        </p>
      </div>
    );
  }

  const toggle = (s: Schema): void => {
    if (includedKeys.has(s.key)) {
      setInclusions(inclusions.filter((i) => i.schemaKey !== s.key));
    } else {
      setInclusions([...inclusions, { schemaKey: s.key, count: 100 }]);
    }
  };

  const updateCount = (schemaKey: string, v: string): void => {
    const n = Number.parseInt(v.replaceAll(/\D/g, '') || '0', 10);
    setInclusions(
      inclusions.map((i) =>
        i.schemaKey === schemaKey ? { ...i, count: Math.min(10_000_000, Math.max(0, n)) } : i,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {showEmptyError && inclusions.length === 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
          Pick at least one schema.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
          {error}
        </div>
      )}

      {inclusions.length > 0 && (
        <section className="rounded-xl border border-border bg-card">
          <header className="border-b border-border px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Selected · {inclusions.length}
          </header>
          <ul>
            {inclusions.map((inc) => {
              const sch = workspaceSchemas.find((s) => s.key === inc.schemaKey);
              if (!sch) return null;
              return (
                <li
                  key={inc.schemaKey}
                  className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0"
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded text-white',
                      BRAND_COLOR_BG[sch.color],
                    )}
                  >
                    <IconByName name={sch.icon} size={12} />
                  </span>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-foreground">{sch.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{sch.key}</div>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="h-8 w-28 rounded-md border border-input bg-background px-2 text-right font-mono text-[13px] text-foreground"
                    value={inc.count.toLocaleString()}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateCount(inc.schemaKey, e.target.value)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => toggle(sch)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                    aria-label={`Remove ${sch.key}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {available.length > 0 && (
        <section className="rounded-xl border border-border bg-card">
          <header className="border-b border-border px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Available · {available.length}
          </header>
          <ul>
            {available.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-2 text-left last:border-b-0 hover:bg-accent/40"
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded text-white',
                      BRAND_COLOR_BG[s.color],
                    )}
                  >
                    <IconByName name={s.icon} size={12} />
                  </span>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-foreground">{s.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{s.key}</div>
                  </div>
                  <Plus size={14} className="text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {available.length === 0 &&
        inclusions.length === workspaceSchemas.length &&
        workspaceSchemas.length > 0 && (
          <p className="text-[12.5px] text-muted-foreground">
            <Check size={12} className="-mt-0.5 mr-1 inline" />
            Every schema in the workspace is included.
          </p>
        )}
    </div>
  );
}
