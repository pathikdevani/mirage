import type { Param } from '@mirage/fakerjs';
import type { ValueExpr } from '@mirage/types';
import { exprAsLiteral } from '../serialize.js';
import { ExpressionField } from './ExpressionField.js';
import { FieldLabel } from './FieldLabel.js';
import type { RefField } from '../../SegmentEditor.js';

/**
 * Boolean params surface a quick true/false toggle while the user is editing a
 * literal value; the `fx` button switches to the shared `ExpressionField` so
 * the slot can hold a sibling/method/ref/fn just like every other arg.
 */
export function BooleanField({
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
  const literal = exprAsLiteral(value);
  const isLiteralBoolean = literal === 'true' || literal === 'false';

  if (value === undefined || isLiteralBoolean) {
    const on = literal === 'true';
    return (
      <div className="flex flex-col gap-1">
        <FieldLabel param={param} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() =>
              onChange(on ? undefined : [{ kind: 'text', text: 'true' }])
            }
            className={
              'flex h-7 w-12 items-center rounded-full p-0.5 transition-colors ' +
              (on ? 'bg-foreground' : 'bg-muted')
            }
          >
            <span
              className={
                'h-6 w-6 rounded-full bg-background shadow-sm transition-transform ' +
                (on ? 'translate-x-5' : 'translate-x-0')
              }
            />
          </button>
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
      placeholder="true | false, or @ to reference"
    />
  );
}
