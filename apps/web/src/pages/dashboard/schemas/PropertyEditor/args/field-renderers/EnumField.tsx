import type { Param } from '@mirage/fakerjs';
import type { ValueExpr } from '@mirage/types';
import { exprAsLiteral } from '../serialize.js';
import { ExpressionField } from './ExpressionField.js';
import { FieldLabel } from './FieldLabel.js';
import type { RefField } from '../../SegmentEditor.js';

/**
 * Enum params show a button group for the common literal-value case; an `fx`
 * button switches the slot to the shared `ExpressionField` so it can hold a
 * sibling/method/ref/fn.
 */
export function EnumField({
  param,
  value,
  onChange,
  invalid,
  fields,
  ownField,
}: {
  param: Param;
  value: ValueExpr | undefined;
  onChange: (v: ValueExpr | undefined) => void;
  invalid?: boolean;
  fields: RefField[];
  ownField: string;
}) {
  const literal = exprAsLiteral(value);
  const options = param.options ?? [];
  const isLiteralEnum =
    value === undefined ||
    (literal !== undefined && (literal === '' || options.includes(literal)));

  if (isLiteralEnum) {
    const current = literal ?? '';
    return (
      <div className="flex flex-col gap-1">
        <FieldLabel param={param} />
        <div
          className={
            'flex flex-wrap items-center gap-1' +
            (invalid ? ' rounded p-0.5 ring-1 ring-destructive' : '')
          }
        >
          {options.map((opt) => (
            <button
              key={opt || '__empty'}
              type="button"
              onClick={() => onChange(opt === '' ? undefined : [{ kind: 'text', text: opt }])}
              className={
                'h-7 rounded-md border px-2.5 text-[12px] transition-colors ' +
                (current === opt
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-input bg-background text-foreground hover:bg-accent')
              }
            >
              {opt === '' ? <span className="italic text-muted-foreground">any</span> : opt}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange([{ kind: 'text', text: ' ' }])}
            className="ml-auto text-[10.5px] text-muted-foreground underline hover:text-foreground"
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
      {...(invalid !== undefined ? { invalid } : {})}
      fields={fields}
      ownField={ownField}
      placeholder={options.join(' | ') || 'value, or @ to reference'}
    />
  );
}
