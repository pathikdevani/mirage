import { useState } from 'react';
import { ChevronDown, ChevronRight, Link2, Package } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { SchemaProp } from './lib/types.js';
import { REF_PREFIX } from './lib/types.js';

interface PropertyTreeProps {
  rows: SchemaProp[];
}

export function PropertyTree({ rows }: PropertyTreeProps) {
  return (
    <div className="flex flex-col">
      <TreeRows rows={rows} depth={0} pathPrefix="" />
    </div>
  );
}

interface TreeRowsProps {
  rows: SchemaProp[];
  depth: number;
  pathPrefix: string;
  asArrayItem?: boolean;
}

function TreeRows({ rows, depth, pathPrefix, asArrayItem }: TreeRowsProps) {
  return (
    <>
      {rows.map((p, idx) => {
        const key = asArrayItem ? 'items' : p.name || `_${idx}`;
        const path = pathPrefix ? `${pathPrefix}.${key}` : key;
        return (
          <Row
            key={path}
            prop={p}
            depth={depth}
            path={path}
            isArrayItem={asArrayItem ?? false}
          />
        );
      })}
    </>
  );
}

interface RowProps {
  prop: SchemaProp;
  depth: number;
  path: string;
  isArrayItem: boolean;
}

function Row({ prop, depth, path, isArrayItem }: RowProps) {
  const isContainer = prop.type === 'object' || prop.type === 'array';
  const [open, setOpen] = useState(true);
  const indent = depth * 20;

  const isRef =
    typeof prop.faker === 'string' && prop.faker.startsWith(REF_PREFIX);
  const refTarget = isRef ? prop.faker!.slice(REF_PREFIX.length) : '';

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[13px]',
        )}
      >
        <div style={{ width: indent }} className="flex-none" />
        <button
          type="button"
          className={cn(
            'flex h-5 w-5 flex-none items-center justify-center rounded text-muted-foreground',
            isContainer ? 'hover:bg-accent' : 'invisible',
          )}
          onClick={() => isContainer && setOpen((v) => !v)}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <span className="min-w-0 flex-none truncate font-mono text-[12.5px] text-foreground">
          {isArrayItem ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Package size={10} /> items
            </span>
          ) : (
            prop.name || '—'
          )}
        </span>

        <TypeChip prop={prop} />
        {prop.format && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {prop.format}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!isContainer && (
            <FakerPill faker={prop.faker} isRef={isRef} refTarget={refTarget} />
          )}
          {isContainer && prop.type === 'object' && (
            <span className="text-[11px] italic text-muted-foreground">
              {(prop.fields ?? []).length} fields
            </span>
          )}
          {isContainer && prop.type === 'array' && (
            <span className="text-[11px] italic text-muted-foreground">
              items: {prop.items?.type ?? 'string'}
            </span>
          )}
          {prop.required && !isArrayItem && (
            <span
              aria-label="required"
              title="required"
              className="h-1.5 w-1.5 rounded-full bg-destructive"
            />
          )}
        </div>
      </div>

      {isContainer && open && prop.type === 'object' && (
        <TreeRows
          rows={prop.fields ?? []}
          depth={depth + 1}
          pathPrefix={path}
        />
      )}
      {isContainer && open && prop.type === 'array' && prop.items && (
        <TreeRows
          rows={[prop.items]}
          depth={depth + 1}
          pathPrefix={path}
          asArrayItem
        />
      )}
    </>
  );
}

function TypeChip({ prop }: { prop: SchemaProp }) {
  if (prop.type === 'object') {
    return (
      <span className="rounded border border-brand-cyan/40 bg-brand-cyan/5 px-1.5 py-0.5 font-mono text-[10px] text-brand-cyan">
        object
      </span>
    );
  }
  if (prop.type === 'array') {
    return (
      <span className="rounded border border-brand-amber/40 bg-brand-amber/5 px-1.5 py-0.5 font-mono text-[10px] text-brand-amber">
        array
      </span>
    );
  }
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {prop.type}
    </span>
  );
}

interface FakerPillProps {
  faker?: string | undefined;
  isRef: boolean;
  refTarget: string;
}

function FakerPill({ faker, isRef, refTarget }: FakerPillProps) {
  if (isRef) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-brand-violet/40 bg-brand-violet/5 px-1.5 py-0.5 font-mono text-[10.5px] text-brand-violet">
        <Link2 size={10} strokeWidth={2} />→ {refTarget}
      </span>
    );
  }
  if (!faker) {
    return (
      <span className="rounded-md border border-dashed border-border px-1.5 py-0.5 text-[10.5px] italic text-muted-foreground">
        no faker
      </span>
    );
  }
  const dot = faker.indexOf('.');
  const ns = dot < 0 ? '' : faker.slice(0, dot);
  const method = dot < 0 ? faker : faker.slice(dot + 1);
  return (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">
      <span className="text-muted-foreground">{ns}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-foreground">{method}</span>
    </span>
  );
}
