import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';
import { RefMentionInput, type RefField } from './RefMentionInput.js';

export function StringField({
  param,
  value,
  onChange,
  invalid,
  fields,
  ownField,
}: {
  param: Param;
  value: unknown;
  onChange: (v: string | undefined) => void;
  invalid?: boolean;
  fields?: RefField[];
  ownField?: string;
}) {
  const v = typeof value === 'string' ? value : '';
  const placeholder = param.default !== undefined ? String(param.default) : undefined;
  const hasFields = (fields ?? []).length > 0;

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      {hasFields ? (
        <RefMentionInput
          value={v}
          onChange={onChange}
          {...(placeholder !== undefined ? { placeholder } : {})}
          fields={fields ?? []}
          {...(ownField !== undefined ? { ownField } : {})}
          {...(invalid !== undefined ? { invalid } : {})}
        />
      ) : (
        <input
          id={`arg-${param.name}`}
          type="text"
          value={v}
          placeholder={placeholder ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={
            'h-8 rounded-md border bg-background px-2 font-mono text-[12px] outline-none focus:ring-[2px] focus:ring-ring/10 ' +
            (invalid
              ? 'border-destructive focus:border-destructive'
              : 'border-input focus:border-ring')
          }
        />
      )}
    </div>
  );
}
