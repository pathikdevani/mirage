import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function StringField({
  param,
  value,
  onChange,
  invalid,
}: {
  param: Param;
  value: unknown;
  onChange: (v: string | undefined) => void;
  invalid?: boolean;
}) {
  const v = typeof value === 'string' ? value : '';
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <input
        id={`arg-${param.name}`}
        type="text"
        value={v}
        placeholder={param.default !== undefined ? String(param.default) : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={
          'h-8 rounded-md border bg-background px-2 font-mono text-[12px] outline-none focus:ring-[2px] focus:ring-ring/10 ' +
          (invalid
            ? 'border-destructive focus:border-destructive'
            : 'border-input focus:border-ring')
        }
      />
    </div>
  );
}
