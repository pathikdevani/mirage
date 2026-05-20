import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { BRAND_COLORS, type BrandColor, type IconName } from './lib/types.js';
import { COLOR_BG } from './lib/colors.js';
import { ICON_ENTRIES, resolveIcon } from './lib/icon.js';

export interface IdentityPopoverProps {
  color: BrandColor;
  icon: IconName;
  onChange: (next: { color: BrandColor; icon: IconName }) => void;
  triggerClassName?: string;
  /** Compact trigger (icon-only square) vs the default labeled pill. */
  compact?: boolean;
}

export function IdentityPopover({
  color,
  icon,
  onChange,
  triggerClassName,
  compact = false,
}: IdentityPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const Icon = resolveIcon(icon);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1 text-[12px] hover:border-foreground/40',
          triggerClassName,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span
          className={cn(
            'flex h-6 w-6 flex-none items-center justify-center rounded text-white',
            COLOR_BG[color],
          )}
        >
          <Icon size={14} strokeWidth={2} />
        </span>
        {!compact && (
          <>
            <span className="font-mono text-[11.5px] text-muted-foreground">{color}</span>
            <ChevronDown size={11} className="text-muted-foreground" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-40 w-[260px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border bg-card px-3 py-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Color
            </div>
            <div className="mt-1.5 flex gap-2">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => onChange({ color: c, icon })}
                  className={cn(
                    'h-6 w-6 rounded-full transition-transform',
                    COLOR_BG[c],
                    color === c && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
                  )}
                />
              ))}
            </div>
          </div>
          <div className="px-3 py-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Icon
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ICON_ENTRIES.map(([n, I]) => (
                <button
                  key={n}
                  type="button"
                  aria-label={n}
                  onClick={() => onChange({ color, icon: n })}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
                    icon === n
                      ? 'border-foreground bg-accent text-foreground'
                      : 'border-input bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                  )}
                >
                  <I size={13} strokeWidth={2} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
