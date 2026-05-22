import type { Param } from '@mirage/fakerjs';
import type { ValueExpr } from '@mirage/types';
import { exprAsLiteral } from '../serialize.js';
import { ExpressionField } from './ExpressionField.js';
import { FieldLabel } from './FieldLabel.js';
import type { RefField } from '../../SegmentEditor.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dates show a native `<input type=date>` for literal entry; the `fx` button
 * promotes the slot to a full `ExpressionField` for ref/method/fn use.
 */
export function DateField({
  param,
  value,
  onChange,
  fields,
  ownField,
}: {
  param: Param;
  value: ValueExpr | undefined;
  onChange: (v: ValueExpr | undefined) => void;
  fields: RefField[];
  ownField: string;
}) {
  const literal = exprAsLiteral(value) ?? '';
  const isLiteralDate = value === undefined || ISO_DATE.test(literal) || literal === '';

  if (isLiteralDate) {
    return (
      <div className="flex flex-col gap-1">
        <FieldLabel param={param} />
        <div className="flex items-center gap-2">
          <input
            id={`arg-${param.name}`}
            type="date"
            value={literal}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? [{ kind: 'text', text: e.target.value }]
                  : undefined,
              )
            }
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
          />
          <button
            type="button"
            onClick={() => onChange([{ kind: 'text', text: ' ' }])}
            className="text-[10.5px] text-muted-foreground underline hover:text-foreground"
            title="Switch to expression"
          >
            fx
          </button>
        </div>
      </div>
    );
  }

  return (
    <ExpressionField
      param={param}
      value={value}
      onChange={onChange}
      fields={fields}
      ownField={ownField}
      placeholder="YYYY-MM-DD, or @ to reference"
    />
  );
}
