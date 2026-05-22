import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function IntegerField({
  param,
  value,
  onChange,
  invalid,
}: {
  param: Param;
  value: unknown;
  onChange: (v: number | undefined) => void;
  invalid?: boolean;
}) {
  const v = typeof value === 'number' ? value : '';
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <input
        id={`arg-${param.name}`}
        type="number"
        value={v}
        step={1}
        min={param.min}
        max={param.max}
        placeholder={param.default !== undefined ? String(param.default) : ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(undefined);
          const n = parseInt(raw, 10);
          onChange(Number.isNaN(n) ? undefined : n);
        }}
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
