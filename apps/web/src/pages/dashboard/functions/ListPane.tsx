import { Code2 } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { CustomFunction } from './lib/types.js';
import { USAGE_LABEL } from './lib/types.js';

interface ListPaneProps {
  functions: CustomFunction[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ListPane({ functions, activeId, onSelect }: ListPaneProps) {
  return (
    <aside className="flex h-full flex-col border-r border-border bg-card">
      <div className="flex flex-none items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
          Functions
        </span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {functions.length}
        </span>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {functions.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onSelect(f.id)}
              className={cn(
                'flex w-full items-start gap-2 border-b border-border px-4 py-3 text-left hover:bg-accent/40',
                activeId === f.id && 'bg-accent/60',
              )}
            >
              <Code2 size={14} className="mt-0.5 flex-none text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12.5px] text-foreground">{f.name}</div>
                <div className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                  {USAGE_LABEL[f.usage]}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
