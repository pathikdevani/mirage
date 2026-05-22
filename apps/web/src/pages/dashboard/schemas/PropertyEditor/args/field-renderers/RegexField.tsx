import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function RegexField({
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
      <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-[2px] focus-within:ring-ring/10">
        <span className="flex items-center border-r border-input bg-muted px-2 font-mono text-[12px] text-muted-foreground">
          /
        </span>
        <input
          id={`arg-${param.name}`}
          type="text"
          value={v}
          placeholder={param.default !== undefined ? String(param.default) : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="h-8 flex-1 bg-transparent px-2 font-mono text-[12px] outline-none"
        />
        <span className="flex items-center border-l border-input bg-muted px-2 font-mono text-[12px] text-muted-foreground">
          /
        </span>
      </div>
    </div>
  );
}
