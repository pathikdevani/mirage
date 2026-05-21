import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Trash2 } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { Schema, SchemaProp } from '../lib/types.js';
import { TYPE_OPTIONS } from '../lib/types.js';
import { FakerCell } from '../PropertyEditor/FakerCell.js';
import { applyTypeChange } from '../PropertyEditor/PropertyEditorRow.js';

export interface EditTabContentProps {
  prop: SchemaProp;
  workspaceSchemas: Schema[];
  onChange: (next: SchemaProp) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onBack: () => void;
}

export function EditTabContent({
  prop,
  workspaceSchemas,
  onChange,
  onDuplicate,
  onRemove,
  onBack,
}: EditTabContentProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => setPickerOpen(false), [prop.name, prop.type]);

  const isContainer = prop.type === 'object' || prop.type === 'array';
  const isArrayItem = prop.name === '';
  const currentValue = `${prop.type}${prop.format ? `|${prop.format}` : ''}`;

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onBack}
        className="flex flex-none items-center gap-1.5 border-b border-border px-4 py-2 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={12} /> Back to preview
      </button>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-3">
          {!isArrayItem && (
            <Field label="Name">
              <input
                value={prop.name}
                onChange={(e) => onChange({ ...prop, name: e.target.value })}
                placeholder="fieldName"
                className="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-[12.5px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
              />
            </Field>
          )}

          <Field label="Type">
            <select
              value={currentValue}
              onChange={(e) => {
                const [t, f] = e.target.value.split('|');
                onChange(applyTypeChange(prop, t as SchemaProp['type'], f as SchemaProp['format']));
              }}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-[12.5px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          {!isContainer && (
            <Field label="Faker / $ref">
              <FakerCell
                value={prop.faker ?? ''}
                onChange={(v) => {
                  const next: SchemaProp = { ...prop };
                  if (v) next.faker = v;
                  else delete next.faker;
                  onChange(next);
                }}
                open={pickerOpen}
                onToggle={() => setPickerOpen((v) => !v)}
                workspaceSchemas={workspaceSchemas}
                invalid={false}
              />
            </Field>
          )}

          {!isArrayItem && (
            <Field label="Required">
              <button
                type="button"
                role="switch"
                aria-checked={prop.required}
                onClick={() => onChange({ ...prop, required: !prop.required })}
                className={cn(
                  'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
                  prop.required ? 'bg-foreground' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'h-4 w-4 rounded-full bg-background transition-transform',
                    prop.required ? 'translate-x-4' : 'translate-x-0',
                  )}
                />
              </button>
            </Field>
          )}
        </div>
      </div>

      {!isArrayItem && (
        <div className="flex flex-none items-center justify-end gap-2 border-t border-border bg-card px-4 py-3">
          <button
            type="button"
            onClick={onDuplicate}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[12px] font-medium hover:bg-accent"
          >
            <Copy size={12} /> Duplicate
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 text-[12px] font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={12} /> Remove
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
