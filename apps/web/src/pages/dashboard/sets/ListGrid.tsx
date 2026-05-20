import { Plus, Tag } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { MirageSet } from './lib/types.js';
import { BRAND_COLOR_BG } from './lib/colors.js';
import { IconByName } from './lib/icon.js';

interface ListGridProps {
  sets: MirageSet[];
  onOpen: (id: string) => void;
  onCreate: () => void;
}

export function ListGrid({ sets, onOpen, onCreate }: ListGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 p-8">
      {sets.map((s) => {
        const totalRows = s.schemas.reduce((sum, x) => sum + x.count, 0);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpen(s.id)}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40"
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'flex h-9 w-9 flex-none items-center justify-center rounded-lg text-white',
                  BRAND_COLOR_BG[s.color],
                )}
              >
                <IconByName name={s.icon} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-foreground">{s.name}</div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {s.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                    >
                      <Tag size={9} /> {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {s.description && (
              <p className="line-clamp-2 text-[12.5px] text-muted-foreground">{s.description}</p>
            )}
            <div className="mt-auto flex flex-wrap gap-1.5">
              {s.schemas.slice(0, 4).map((inc) => (
                <span
                  key={inc.schemaKey}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10.5px] font-mono text-foreground"
                >
                  {inc.schemaKey} · {inc.count.toLocaleString()}
                </span>
              ))}
              {s.schemas.length > 4 && (
                <span className="text-[11px] text-muted-foreground">
                  +{s.schemas.length - 4} more
                </span>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 text-[11.5px]">
              <span className="text-muted-foreground">
                Total ·{' '}
                <span className="font-medium text-foreground">
                  {totalRows.toLocaleString()} rows
                </span>
              </span>
              <span className="font-mono text-muted-foreground">salt · {s.salt}</span>
            </div>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onCreate}
        className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background/50 p-8 text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent/40"
      >
        <Plus size={20} />
        <span className="text-[13px] font-medium">New set</span>
        <span className="max-w-[220px] text-center text-[11.5px] text-muted-foreground">
          Pick schemas, set counts and strategies, save a reusable recipe.
        </span>
      </button>
    </div>
  );
}
