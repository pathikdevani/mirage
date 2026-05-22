import { useRef, useState } from 'react';
import { Sliders } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { FAKER_CATALOG } from '@mirage/fakerjs';
import { ArgsPopover } from './ArgsPopover.js';
import type { RefField } from './field-renderers/RefMentionInput.js';
import { toInternal, type ArgsStored } from './serialize.js';
import { validateArgs } from './validate.js';

export interface ArgsChipProps {
  method: string;
  stored: ArgsStored | undefined;
  onChange: (next: ArgsStored | undefined) => void;
  fields?: RefField[];
  ownField?: string;
}

const REF_PREFIX = '$ref:';
const FN_PREFIX = '$fn:';

export function ArgsChip({ method, stored, onChange, fields, ownField }: ArgsChipProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  if (!method || method.startsWith(REF_PREFIX) || method.startsWith(FN_PREFIX)) return null;
  const entry = FAKER_CATALOG[method];
  if (!entry || entry.shape === 'none') return null;

  const count = stored
    ? Array.isArray(stored)
      ? stored.filter((v) => v !== undefined && v !== '').length
      : Object.values(stored).filter((v) => v !== undefined && v !== '').length
    : 0;

  const invalid = !!validateArgs(entry, toInternal(entry, stored));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-md border px-2 font-mono text-[10.5px]',
          invalid
            ? 'border-destructive bg-destructive/10 text-destructive'
            : count > 0
              ? 'border-foreground bg-foreground text-background'
              : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        title={count > 0 ? `${count} argument(s)` : 'configure arguments'}
      >
        <Sliders size={10} />
        {count > 0 ? count : 'ARGS'}
      </button>
      <ArgsPopover
        anchorRef={btnRef}
        open={open}
        method={method}
        stored={stored}
        onChange={onChange}
        onClose={() => setOpen(false)}
        {...(fields ? { fields } : {})}
        {...(ownField !== undefined ? { ownField } : {})}
      />
    </>
  );
}
