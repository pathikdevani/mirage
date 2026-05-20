import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Link2, Search } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { Schema, SchemaProp } from '../lib/types.js';
import { FAKER_GROUPS, REF_PREFIX } from '../lib/types.js';

export interface FakerCellProps {
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  onToggle: () => void;
  workspaceSchemas: Schema[];
  invalid: boolean;
}

export function FakerCell({
  value,
  onChange,
  open,
  onToggle,
  workspaceSchemas,
  invalid,
}: FakerCellProps) {
  const isRef = value.startsWith(REF_PREFIX);
  const refTarget = isRef ? value.slice(REF_PREFIX.length) : '';
  const dot = !isRef && value ? value.indexOf('.') : -1;
  const ns = dot < 0 ? '' : value.slice(0, dot);
  const method = dot < 0 ? value : value.slice(dot + 1);

  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const refOptions = useMemo(() => {
    const out: { key: string; field: string; type: SchemaProp['type'] }[] = [];
    const flatten = (key: string, props: SchemaProp[], path: string): void => {
      for (const p of props) {
        const nextPath = path ? `${path}.${p.name}` : p.name;
        if (p.type !== 'object' && p.type !== 'array') {
          out.push({ key, field: nextPath, type: p.type });
        }
        if (p.type === 'object' && Array.isArray(p.fields)) {
          flatten(key, p.fields, nextPath);
        }
      }
    };
    for (const s of workspaceSchemas) flatten(s.key, s.properties, '');
    return out;
  }, [workspaceSchemas]);

  const lowerFilter = filter.trim().toLowerCase();
  const filteredRefs = lowerFilter
    ? refOptions.filter(
        (r) =>
          r.key.toLowerCase().includes(lowerFilter) ||
          r.field.toLowerCase().includes(lowerFilter),
      )
    : refOptions;
  const filteredGroups = lowerFilter
    ? FAKER_GROUPS.map((g) => ({
        ...g,
        methods: g.methods.filter(
          (m) =>
            m.toLowerCase().includes(lowerFilter) ||
            g.ns.toLowerCase().includes(lowerFilter),
        ),
      })).filter((g) => g.methods.length > 0)
    : FAKER_GROUPS;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex h-7 w-full items-center gap-1.5 rounded-md border bg-background px-2 text-left text-[11.5px]',
          invalid ? 'border-destructive' : 'border-input',
        )}
      >
        {!value && (
          <span className="italic text-muted-foreground">— pick a method —</span>
        )}
        {value && isRef && (
          <span className="inline-flex items-center gap-1 truncate">
            <Link2 size={10} className="text-brand-violet" />
            <span className={cn('font-mono', invalid && 'text-destructive')}>{refTarget}</span>
          </span>
        )}
        {value && !isRef && (
          <span className="inline-flex items-center gap-0.5 truncate font-mono">
            <span className="text-muted-foreground">{ns}</span>
            <span className="text-muted-foreground">.</span>
            <span className="text-foreground">{method}</span>
          </span>
        )}
        <ChevronDown size={11} className="ml-auto flex-none text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onToggle} />
          <div className="absolute left-0 top-8 z-40 w-[320px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            <div className="border-b border-border bg-card px-2 py-2">
              <div className="relative">
                <Search
                  size={12}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  ref={inputRef}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter…"
                  autoFocus
                  className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 text-[12px] outline-none focus:border-ring"
                />
              </div>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {filteredRefs.length > 0 && (
                <>
                  <div className="px-2 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    References (cross-schema)
                  </div>
                  {filteredRefs.map((r) => (
                    <button
                      key={`${r.key}.${r.field}`}
                      type="button"
                      onClick={() => {
                        onChange(`${REF_PREFIX}${r.key}.${r.field}`);
                        onToggle();
                      }}
                      className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11.5px] hover:bg-accent"
                    >
                      <Link2 size={11} className="text-brand-violet" />
                      <span className="font-mono">
                        <b>{r.key}</b>
                        <span className="text-muted-foreground">.</span>
                        {r.field}
                      </span>
                      <span className="ml-auto rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {r.type}
                      </span>
                    </button>
                  ))}
                </>
              )}
              {filteredGroups.length > 0 && (
                <>
                  <div className="px-2 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Faker methods
                  </div>
                  {filteredGroups.map((g) => (
                    <div key={g.ns}>
                      <div className="px-2 pt-1 text-[10px] font-medium text-muted-foreground">
                        {g.ns}
                      </div>
                      {g.methods.map((m) => (
                        <button
                          key={`${g.ns}.${m}`}
                          type="button"
                          onClick={() => {
                            onChange(`${g.ns}.${m}`);
                            onToggle();
                          }}
                          className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11.5px] hover:bg-accent"
                        >
                          <span className="rounded bg-brand-violet/10 px-1 py-0 font-mono text-[10px] text-brand-violet">
                            {g.ns}
                          </span>
                          <span className="font-mono">.{m}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
              {filteredRefs.length === 0 && filteredGroups.length === 0 && (
                <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
                  No matches
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
