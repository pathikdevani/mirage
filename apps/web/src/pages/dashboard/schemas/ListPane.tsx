import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { Schema } from './lib/types.js';
import { COLOR_BG } from './lib/colors.js';
import { resolveIcon } from './lib/icon.js';

interface ListPaneProps {
  schemas: Schema[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ListPane({ schemas, activeId, onSelect }: ListPaneProps) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return schemas;
    return schemas.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        s.key.toLowerCase().includes(needle) ||
        s.tags.some((t) => t.toLowerCase().includes(needle)),
    );
  }, [schemas, q]);

  return (
    <aside className="flex h-full flex-col border-r border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <div className="relative">
          <Search
            size={13}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 text-[12px] outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/10"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
            {q ? 'No matches' : 'No schemas yet'}
          </div>
        ) : (
          filtered.map((s) => {
            const Icon = resolveIcon(s.icon);
            const isActive = s.id === activeId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors',
                  isActive ? 'bg-accent' : 'hover:bg-accent/50',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 flex-none items-center justify-center rounded-md text-white',
                    COLOR_BG[s.color],
                  )}
                >
                  <Icon size={14} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {s.name}
                  </div>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {s.key}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
