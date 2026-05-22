import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function EnumField({
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
  const current = typeof value === 'string' ? value : '';
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <div
        className={
          'flex flex-wrap gap-1' +
          (invalid ? ' ring-1 ring-destructive rounded p-0.5' : '')
        }
      >
        {(param.options ?? []).map((opt) => (
          <button
            key={opt || '__empty'}
            type="button"
            onClick={() => onChange(opt === '' ? undefined : opt)}
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
      </div>
    </div>
  );
}
