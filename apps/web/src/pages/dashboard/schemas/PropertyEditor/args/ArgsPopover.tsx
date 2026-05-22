import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { FAKER_CATALOG } from '@mirage/fakerjs';
import { ArgsEditor } from './ArgsEditor.js';
import type { RefField } from './field-renderers/RefMentionInput.js';
import type { ArgsStored } from './serialize.js';

export interface ArgsPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  method: string;
  stored: ArgsStored | undefined;
  onChange: (next: ArgsStored | undefined) => void;
  onClose: () => void;
  fields?: RefField[];
  ownField?: string;
}

export function ArgsPopover({
  anchorRef,
  open,
  method,
  stored,
  onChange,
  onClose,
  fields,
  ownField,
}: ArgsPopoverProps) {
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = (): void => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 420;
      const left = Math.min(window.innerWidth - w - 12, Math.max(12, r.right - w));
      setPos({ left, top: r.bottom + 6, width: w });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event): void => {
      if (popRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [open, onClose]);

  if (!open || !pos) return null;
  const entry = FAKER_CATALOG[method];
  const dot = method.indexOf('.');
  const ns = dot < 0 ? '' : method.slice(0, dot);
  const m = dot < 0 ? method : method.slice(dot + 1);

  return createPortal(
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        ref={popRef}
        className="fixed z-40 overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        style={{ left: pos.left, top: pos.top, width: pos.width }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border bg-card/60 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="rounded bg-brand-violet/10 px-1.5 py-0.5 font-mono text-[10.5px] text-brand-violet">
                {ns}
              </span>
              <span className="font-mono text-foreground">.{m}</span>
              {entry && (
                <span className="ml-1 rounded-md border border-input bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {entry.shape === 'options'
                    ? '{ options }'
                    : entry.shape === 'positional'
                      ? '(positional)'
                      : '(none)'}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            disabled={stored === undefined}
            className="rounded-md border border-input bg-background px-2 py-1 text-[10.5px] text-muted-foreground hover:enabled:bg-accent hover:enabled:text-foreground disabled:opacity-50"
            title="Reset to defaults"
          >
            reset
          </button>
        </div>
        <div className="max-h-[440px] overflow-y-auto px-3 py-3">
          <ArgsEditor
            method={method}
            stored={stored}
            onChange={onChange}
            {...(fields ? { fields } : {})}
            {...(ownField !== undefined ? { ownField } : {})}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
