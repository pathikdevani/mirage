import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function ArrayField({
  param,
  value,
  onChange,
}: {
  param: Param;
  value: unknown;
  onChange: (v: string[] | undefined) => void;
}) {
  const arr = Array.isArray(value) ? (value as string[]) : [];
  const text = arr.join('\n');
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <textarea
        id={`arg-${param.name}`}
        rows={Math.max(3, arr.length)}
        value={text}
        placeholder={'one\nper\nline'}
        onChange={(e) => {
          const lines = e.target.value.split('\n').map((s) => s.replace(/\r$/, ''));
          const trimmed =
            lines.length && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
          onChange(trimmed.length === 0 ? undefined : trimmed);
        }}
        className="rounded-md border border-input bg-background px-2 py-1.5 font-mono text-[12px] leading-snug outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
      />
      {arr.length > 0 && (
        <div className="text-[10.5px] text-muted-foreground">
          {arr.length} item{arr.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}
