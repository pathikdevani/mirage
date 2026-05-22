import type { Param } from '@mirage/fakerjs';
import type { ValueExpr } from '@mirage/types';
import { SegmentEditor, type RefField } from '../../SegmentEditor.js';
import { FieldLabel } from './FieldLabel.js';

export interface ExpressionFieldProps {
  param: Param;
  value: ValueExpr | undefined;
  onChange: (next: ValueExpr | undefined) => void;
  invalid?: boolean;
  fields: RefField[];
  ownField: string;
  /** Override the placeholder hint (defaults to the param's `default`). */
  placeholder?: string;
}

export function ExpressionField({
  param,
  value,
  onChange,
  invalid,
  fields,
  ownField,
  placeholder,
}: ExpressionFieldProps) {
  const ph =
    placeholder ??
    (param.default !== undefined ? String(param.default) : 'type, or @ to insert');
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <SegmentEditor
        value={value}
        onChange={onChange}
        siblingFields={fields}
        ownFieldName={ownField}
        placeholder={ph}
        {...(invalid !== undefined ? { invalid } : {})}
      />
    </div>
  );
}
