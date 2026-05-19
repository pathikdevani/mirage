import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, GripVertical, Link2, Package, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { Schema, SchemaProp } from '../lib/types.js';
import { FAKER_GROUPS, REF_PREFIX, TYPE_OPTIONS } from '../lib/types.js';
import { countTreeStats } from '../lib/treeStats.js';
import { validateTree, type ValidationIssue } from '../lib/validateTree.js';

interface Step2Props {
  rows: SchemaProp[];
  setRows: (rows: SchemaProp[]) => void;
  availableKeys: ReadonlySet<string>;
  workspaceSchemas: Schema[];
  cycleBanner: string | null;
  rowErrors: ReadonlyMap<string, ValidationIssue>;
  showEmptyError: boolean;
}

export function Step2Builder({
  rows,
  setRows,
  availableKeys,
  workspaceSchemas,
  cycleBanner,
  rowErrors,
  showEmptyError,
}: Step2Props) {
  const stats = countTreeStats(rows);
  const liveIssues = useMemo(() => validateTree(rows, availableKeys), [rows, availableKeys]);
  const liveByPath = useMemo(() => {
    const m = new Map<string, ValidationIssue>();
    for (const i of liveIssues) {
      if (!m.has(i.path)) m.set(i.path, i);
    }
    return m;
  }, [liveIssues]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[13.5px] font-semibold text-foreground">Properties</div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Define the shape of each generated row. Use <span className="font-mono">object</span> /
          <span className="font-mono"> array</span> to nest fields at any depth.
        </p>
      </div>

      {showEmptyError && rows.length === 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          Add at least one property to continue.
        </div>
      )}
      {cycleBanner && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {cycleBanner}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="grid grid-cols-[20px_20px_minmax(140px,1fr)_140px_minmax(140px,1fr)_60px_28px] items-center gap-2 border-b border-border bg-muted px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span />
          <span />
          <span>Name</span>
          <span>Type</span>
          <span>Faker / $ref</span>
          <span className="text-center">Req</span>
          <span />
        </div>
        <NestedBuilder
          rows={rows}
          setRows={setRows}
          depth={0}
          parentKind="root"
          workspaceSchemas={workspaceSchemas}
          rowErrors={rowErrors}
          liveByPath={liveByPath}
          basePath=""
        />
      </div>

      <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
        <span><b className="text-foreground">{stats.total}</b> total fields</span>
        <span>·</span>
        <span><b className="text-foreground">{stats.required}</b> required</span>
        <span>·</span>
        <span>
          <b className="text-brand-violet">{stats.refs}</b> references
        </span>
        <span>·</span>
        <span>max depth <b className="text-foreground">{stats.maxDepth}</b></span>
      </div>
    </div>
  );
}

interface NestedBuilderProps {
  rows: SchemaProp[];
  setRows: (rows: SchemaProp[]) => void;
  depth: number;
  parentKind: 'root' | 'object' | 'array';
  workspaceSchemas: Schema[];
  rowErrors: ReadonlyMap<string, ValidationIssue>;
  liveByPath: ReadonlyMap<string, ValidationIssue>;
  basePath: string;
}

function NestedBuilder(props: NestedBuilderProps) {
  const { rows, setRows, depth, parentKind, workspaceSchemas, rowErrors, liveByPath, basePath } = props;
  const [pickerOpenIdx, setPickerOpenIdx] = useState<number | null>(null);

  const updateRow = (idx: number, patch: Partial<SchemaProp> | ((r: SchemaProp) => SchemaProp)): void => {
    const next = rows.map((r, i) => {
      if (i !== idx) return r;
      return typeof patch === 'function' ? patch(r) : { ...r, ...patch };
    });
    setRows(next);
  };
  const removeRow = (idx: number): void => {
    setRows(rows.filter((_, i) => i !== idx));
  };
  const addRow = (): void => {
    setRows([...rows, makeProp('newField', 'string')]);
  };

  return (
    <>
      {rows.map((row, idx) => {
        const isArrayItem = parentKind === 'array';
        const path = isArrayItem ? `${basePath}[]` : (basePath ? `${basePath}.${row.name}` : row.name);
        const persistedErr = rowErrors.get(path);
        const liveErr = liveByPath.get(path);
        const err = persistedErr ?? liveErr;
        return (
          <BuilderRow
            key={idx}
            row={row}
            depth={depth}
            isArrayItem={isArrayItem}
            workspaceSchemas={workspaceSchemas}
            pickerOpen={pickerOpenIdx === idx}
            togglePicker={() => setPickerOpenIdx(pickerOpenIdx === idx ? null : idx)}
            updateRow={(patch) => updateRow(idx, patch)}
            removeRow={() => removeRow(idx)}
            {...(err ? { error: err } : {})}
            errorChildren={(() => {
              if (row.type === 'object') {
                return (
                  <NestedBuilder
                    rows={row.fields ?? []}
                    setRows={(nf) => updateRow(idx, { fields: nf })}
                    depth={depth + 1}
                    parentKind="object"
                    workspaceSchemas={workspaceSchemas}
                    rowErrors={rowErrors}
                    liveByPath={liveByPath}
                    basePath={path}
                  />
                );
              }
              if (row.type === 'array' && row.items) {
                return (
                  <NestedBuilder
                    rows={[row.items]}
                    setRows={([newItem]) => {
                      if (newItem) updateRow(idx, { items: newItem });
                    }}
                    depth={depth + 1}
                    parentKind="array"
                    workspaceSchemas={workspaceSchemas}
                    rowErrors={rowErrors}
                    liveByPath={liveByPath}
                    basePath={path}
                  />
                );
              }
              return null;
            })()}
          />
        );
      })}
      {parentKind !== 'array' && (
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 border-t border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
          style={{ paddingLeft: 32 + depth * 20 }}
        >
          <Plus size={12} strokeWidth={2} />
          Add {depth === 0 ? 'property' : 'field'}
        </button>
      )}
    </>
  );
}

interface BuilderRowProps {
  row: SchemaProp;
  depth: number;
  isArrayItem: boolean;
  workspaceSchemas: Schema[];
  pickerOpen: boolean;
  togglePicker: () => void;
  updateRow: (patch: Partial<SchemaProp> | ((r: SchemaProp) => SchemaProp)) => void;
  removeRow: () => void;
  error?: ValidationIssue;
  errorChildren?: React.ReactNode;
}

function BuilderRow({
  row,
  depth,
  isArrayItem,
  workspaceSchemas,
  pickerOpen,
  togglePicker,
  updateRow,
  removeRow,
  error,
  errorChildren,
}: BuilderRowProps) {
  const isContainer = row.type === 'object' || row.type === 'array';
  const [expanded, setExpanded] = useState(true);
  const indent = depth * 20;
  const currentValue = `${row.type}${row.format ? `|${row.format}` : ''}`;

  return (
    <>
      <div
        className={cn(
          'grid grid-cols-[20px_20px_minmax(140px,1fr)_140px_minmax(140px,1fr)_60px_28px] items-center gap-2 border-b border-border px-2 py-1.5 transition-colors',
          error ? 'bg-destructive/5' : 'bg-background',
          row.type === 'object' && 'border-l-2 border-l-brand-cyan/60',
          row.type === 'array' && 'border-l-2 border-l-brand-amber/60',
        )}
        title={error ? errorLabel(error) : undefined}
      >
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center text-muted-foreground',
            isArrayItem && 'invisible',
          )}
        >
          <GripVertical size={12} />
        </span>
        <button
          type="button"
          onClick={() => isContainer && setExpanded((v) => !v)}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded text-muted-foreground',
            isContainer ? 'hover:bg-accent' : 'invisible',
          )}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <div className="min-w-0" style={{ paddingLeft: indent }}>
          {isArrayItem ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
              <Package size={10} /> items
            </span>
          ) : (
            <input
              value={row.name}
              onChange={(e) => updateRow({ name: e.target.value })}
              placeholder="fieldName"
              className={cn(
                'h-7 w-full rounded-md border bg-background px-2 font-mono text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10',
                error && (error.kind === 'name_invalid' || error.kind === 'name_duplicate')
                  ? 'border-destructive'
                  : 'border-input',
              )}
            />
          )}
        </div>

        <select
          value={currentValue}
          onChange={(e) => {
            const [t, f] = e.target.value.split('|');
            updateRow((r) => applyTypeChange(r, t as SchemaProp['type'], f as SchemaProp['format']));
          }}
          className="h-7 rounded-md border border-input bg-background px-2 text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {isContainer ? (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {row.type === 'object'
              ? `${(row.fields ?? []).length} fields`
              : `items: ${row.items?.type ?? 'string'}`}
          </span>
        ) : (
          <FakerCell
            value={row.faker ?? ''}
            onChange={(v) =>
              updateRow((r) => {
                const next: SchemaProp = { ...r };
                if (v) next.faker = v;
                else delete next.faker;
                return next;
              })
            }
            open={pickerOpen}
            onToggle={togglePicker}
            workspaceSchemas={workspaceSchemas}
            invalid={error?.kind === 'ref_target_missing'}
          />
        )}

        {isArrayItem ? (
          <span />
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={row.required}
            onClick={() => updateRow({ required: !row.required })}
            className={cn(
              'mx-auto flex h-4 w-7 items-center rounded-full p-0.5 transition-colors',
              row.required ? 'bg-foreground' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'h-3 w-3 rounded-full bg-background transition-transform',
                row.required ? 'translate-x-3' : 'translate-x-0',
              )}
            />
          </button>
        )}

        {isArrayItem ? (
          <span />
        ) : (
          <button
            type="button"
            onClick={removeRow}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove property"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {isContainer && expanded && errorChildren}
    </>
  );
}

function errorLabel(issue: ValidationIssue): string {
  switch (issue.kind) {
    case 'name_invalid':
      return 'Name must match ^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$';
    case 'name_duplicate':
      return `Duplicate sibling name: ${issue.sibling}`;
    case 'ref_target_missing':
      return `Reference target missing: ${issue.targetKey}`;
  }
}

interface FakerCellProps {
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  onToggle: () => void;
  workspaceSchemas: Schema[];
  invalid: boolean;
}

function FakerCell({ value, onChange, open, onToggle, workspaceSchemas, invalid }: FakerCellProps) {
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

function makeProp(name: string, type: SchemaProp['type']): SchemaProp {
  const base: SchemaProp = { name, type, required: false };
  if (type === 'object') return { ...base, fields: [] };
  if (type === 'array') return { ...base, items: { name: '', type: 'string', required: false } };
  return base;
}

function applyTypeChange(r: SchemaProp, type: SchemaProp['type'], format?: SchemaProp['format']): SchemaProp {
  const next: SchemaProp = { name: r.name, type, required: r.required };
  if (format) next.format = format;
  if (type === 'object') {
    next.fields = r.type === 'object' && Array.isArray(r.fields) ? r.fields : [];
  } else if (type === 'array') {
    next.items =
      r.type === 'array' && r.items
        ? r.items
        : { name: '', type: 'string', required: false };
  } else if (r.faker) {
    next.faker = r.faker;
  }
  return next;
}
