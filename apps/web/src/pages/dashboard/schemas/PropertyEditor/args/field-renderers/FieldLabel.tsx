import type { Param } from '@mirage/fakerjs';

export function FieldLabel({ param }: { param: Param }) {
  return (
    <label
      htmlFor={`arg-${param.name}`}
      className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground"
    >
      <span>{param.label}</span>
      {param.hint && (
        <span className="font-normal normal-case tracking-normal text-[10.5px] text-muted-foreground/70">
          {param.hint}
        </span>
      )}
    </label>
  );
}
