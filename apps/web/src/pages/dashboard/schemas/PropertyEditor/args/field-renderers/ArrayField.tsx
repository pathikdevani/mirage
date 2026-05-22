import { Plus, Trash2 } from 'lucide-react';
import type { Param } from '@mirage/fakerjs';
import type { ValueExpr } from '@mirage/types';
import { SegmentEditor, type RefField } from '../../SegmentEditor.js';
import { FieldLabel } from './FieldLabel.js';

/**
 * Array params: each element is its own `ValueExpr`, so a list slot can mix
 * literal values, sibling-field references, faker calls, and custom-function
 * calls element by element.
 */
export function ArrayField({
  param,
  value,
  onChange,
  fields,
  ownField,
}: {
  param: Param;
  value: ValueExpr[];
  onChange: (v: ValueExpr[] | undefined) => void;
  fields: RefField[];
  ownField: string;
}) {
  const items = value.length > 0 ? value : [];

  const setItem = (idx: number, next: ValueExpr | undefined): void => {
    if (next === undefined || next.length === 0) {
      const out = items.filter((_, i) => i !== idx);
      onChange(out.length === 0 ? undefined : out);
      return;
    }
    onChange(items.map((it, i) => (i === idx ? next : it)));
  };

  const addItem = (): void => {
    onChange([...items, [{ kind: 'text', text: '' }]]);
  };

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <div className="flex flex-col gap-1.5 rounded-md border border-input bg-background p-1.5">
        {items.length === 0 && (
          <div className="px-1 py-1 text-[11px] text-muted-foreground">
            No items yet — add one to start.
          </div>
        )}
        {items.map((expr, idx) => (
          <div key={idx} className="flex items-stretch gap-1">
            <div className="flex-1">
              <SegmentEditor
                value={expr}
                onChange={(next) => setItem(idx, next)}
                siblingFields={fields}
                ownFieldName={ownField}
                placeholder="value, or @ to reference"
              />
            </div>
            <button
              type="button"
              onClick={() => setItem(idx, undefined)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Remove item"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="flex items-center justify-center gap-1 rounded-md border border-dashed border-input px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus size={11} />
          Add item
        </button>
      </div>
      {items.length > 0 && (
        <div className="text-[10.5px] text-muted-foreground">
          {items.length} item{items.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}
