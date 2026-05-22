import type React from 'react';
import { useState } from 'react';
import { ChevronDown, ChevronRight, GripVertical, Package, Trash2 } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { Schema, SchemaProp } from '../lib/types.js';
import { TYPE_OPTIONS } from '../lib/types.js';
import type { ValidationIssue } from '../lib/validateTree.js';
import { FakerCell } from './FakerCell.js';
import type { RefField } from './args/field-renderers/RefMentionInput.js';
import type { ArgsStored } from './args/serialize.js';

export interface PropertyEditorRowProps {
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
  selected: boolean;
  onSelect: () => void;
  siblingFields: RefField[];
}

export function PropertyEditorRow({
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
  selected,
  onSelect,
  siblingFields,
}: PropertyEditorRowProps) {
  const isContainer = row.type === 'object' || row.type === 'array';
  const [expanded, setExpanded] = useState(true);
  const indent = depth * 20;
  const currentValue = `${row.type}${row.format ? `|${row.format}` : ''}`;

  const handleRowMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'SELECT' ||
      tag === 'TEXTAREA' ||
      tag === 'BUTTON' ||
      target.closest('button') ||
      target.closest('select') ||
      target.closest('input')
    ) {
      return;
    }
    onSelect();
  };

  return (
    <>
      <div
        data-selected={selected || undefined}
        onMouseDown={handleRowMouseDown}
        className={cn(
          'grid grid-cols-[20px_20px_minmax(140px,1fr)_140px_minmax(140px,1fr)_60px_28px] items-center gap-2 border-b border-border px-2 py-1.5 transition-colors',
          error ? 'bg-destructive/5' : 'bg-background',
          row.type === 'object' && 'border-l-2 border-l-brand-cyan/60',
          row.type === 'array' && 'border-l-2 border-l-brand-amber/60',
          selected && 'bg-accent/60 ring-1 ring-inset ring-ring/40',
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
            updateRow((r) =>
              applyTypeChange(r, t as SchemaProp['type'], f as SchemaProp['format']),
            );
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
            onChange={(v, opts) =>
              updateRow((r) => {
                const next: SchemaProp = { ...r };
                if (v) next.faker = v;
                else delete next.faker;
                if (opts?.clearArgs) delete (next as { fakerArgs?: unknown }).fakerArgs;
                return next;
              })
            }
            open={pickerOpen}
            onToggle={togglePicker}
            workspaceSchemas={workspaceSchemas}
            invalid={error?.kind === 'ref_target_missing'}
            fakerArgs={(row as { fakerArgs?: ArgsStored }).fakerArgs}
            onFakerArgsChange={(next) =>
              updateRow((r) => {
                const updated: SchemaProp = { ...r };
                if (next === undefined) delete (updated as { fakerArgs?: unknown }).fakerArgs;
                else (updated as { fakerArgs?: unknown }).fakerArgs = next;
                return updated;
              })
            }
            argRefFields={siblingFields}
            ownFieldName={row.name}
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

export function errorLabel(issue: ValidationIssue): string {
  switch (issue.kind) {
    case 'name_invalid':
      return 'Name must match ^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$';
    case 'name_duplicate':
      return `Duplicate sibling name: ${issue.sibling}`;
    case 'ref_target_missing':
      return `Reference target missing: ${issue.targetKey}`;
  }
}

export function applyTypeChange(
  r: SchemaProp,
  type: SchemaProp['type'],
  format?: SchemaProp['format'],
): SchemaProp {
  const next: SchemaProp = { name: r.name, type, required: r.required };
  if (format) next.format = format;
  if (type === 'object') {
    next.fields = r.type === 'object' && Array.isArray(r.fields) ? r.fields : [];
  } else if (type === 'array') {
    next.items =
      r.type === 'array' && r.items ? r.items : { name: '', type: 'string', required: false };
  } else if (r.faker) {
    next.faker = r.faker;
  }
  return next;
}

export function makeProp(name: string, type: SchemaProp['type']): SchemaProp {
  const base: SchemaProp = { name, type, required: false };
  if (type === 'object') return { ...base, fields: [] };
  if (type === 'array') return { ...base, items: { name: '', type: 'string', required: false } };
  return base;
}
