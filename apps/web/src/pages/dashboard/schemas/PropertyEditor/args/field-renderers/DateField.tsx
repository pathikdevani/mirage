import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function DateField({
  param,
  value,
  onChange,
}: {
  param: Param;
  value: unknown;
  onChange: (v: string | undefined) => void;
}) {
  const v = typeof value === 'string' ? value : '';
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <input
        id={`arg-${param.name}`}
        type="date"
        value={v}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-8 rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
      />
    </div>
  );
}
