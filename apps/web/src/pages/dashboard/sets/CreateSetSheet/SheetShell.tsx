import { useEffect, useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@mirage/ui-kit';

const STEPS = ['Details', 'Schemas', 'Review'] as const;

interface SheetShellProps {
  step: 1 | 2 | 3;
  workspaceName: string;
  isDirty: boolean;
  onClose: () => void;
  status: string;
  primaryLabel: string;
  primaryDisabled: boolean;
  primaryLoading: boolean;
  onBack?: () => void;
  onPrimary: () => void;
  children: ReactNode;
}

export function SheetShell({
  step,
  workspaceName,
  isDirty,
  onClose,
  status,
  primaryLabel,
  primaryDisabled,
  primaryLoading,
  onBack,
  onPrimary,
  children,
}: SheetShellProps) {
  const [confirming, setConfirming] = useState(false);
  const attemptClose = (): void => {
    if (isDirty) setConfirming(true);
    else onClose();
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex">
      <button
        type="button"
        aria-label="Close"
        className="flex-1 bg-background/60 backdrop-blur-sm"
        onClick={attemptClose}
      />
      <div className="flex h-full w-full max-w-[720px] flex-col border-l border-border bg-card shadow-2xl md:w-[720px]">
        <header className="flex flex-none items-start gap-3 border-b border-border px-5 py-4">
          <div className="flex-1">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">
              Create set
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              in <span className="font-medium text-foreground">{workspaceName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={attemptClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-none items-center gap-2 border-b border-border px-5 py-3">
          {STEPS.map((label, i) => {
            const idx = (i + 1) as 1 | 2 | 3;
            const done = step > idx;
            const active = step === idx;
            return (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
                    done && 'bg-brand-emerald text-white',
                    active && 'bg-foreground text-background',
                    !done && !active && 'bg-muted text-muted-foreground',
                  )}
                >
                  {done ? <Check size={12} strokeWidth={3} /> : idx}
                </span>
                <span
                  className={cn(
                    'text-[12.5px]',
                    active ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
                {idx < 3 && <span className="mx-2 h-px w-8 bg-border" aria-hidden="true" />}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        <footer className="flex flex-none items-center gap-3 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={attemptClose}
            className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <span className="ml-auto text-[12px] text-muted-foreground">{status}</span>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onPrimary}
            disabled={primaryDisabled || primaryLoading}
            className={cn(
              'h-9 rounded-md bg-primary px-4 text-[12.5px] font-medium text-primary-foreground transition-opacity',
              primaryDisabled || primaryLoading
                ? 'cursor-not-allowed opacity-50'
                : 'hover:opacity-90',
            )}
          >
            {primaryLoading ? 'Working…' : primaryLabel}
          </button>
        </footer>

        {confirming && (
          <DiscardConfirm
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false);
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}

function DiscardConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
        <h3 className="text-[15px] font-semibold text-foreground">Discard this set?</h3>
        <p className="mt-1.5 text-[13px] text-muted-foreground">Your edits will be lost.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-md bg-destructive px-3 text-[12.5px] font-medium text-destructive-foreground hover:opacity-90"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
