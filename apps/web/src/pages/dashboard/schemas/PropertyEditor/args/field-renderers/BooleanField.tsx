import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function BooleanField({
  param,
  value,
  onChange,
}: {
  param: Param;
  value: unknown;
  onChange: (v: boolean | undefined) => void;
}) {
  const on = value === true;
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(on ? undefined : true)}
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
    </div>
  );
}
