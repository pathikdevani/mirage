import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@mirage/ui-kit';

interface DeleteWorkspaceModalProps {
  workspaceName: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteWorkspaceModal({
  workspaceName,
  open,
  onClose,
  onConfirm,
}: DeleteWorkspaceModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset transient state every time the modal opens — without this, a
  // successful delete leaves `submitting` true (the success path closes the
  // modal externally rather than resetting), so the next workspace's modal
  // would render as "Deleting…" disabled.
  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  const handleConfirm = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete workspace.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-workspace-title"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="delete-workspace-title"
              className="text-[15px] font-semibold text-foreground"
            >
              Delete workspace “{workspaceName}”?
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              This permanently removes all schemas, sets, custom functions, and
              generated data for this workspace. This cannot be undone.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className={cn(
              'h-9 rounded-md border border-input bg-background px-3 text-[13px] font-medium transition-colors',
              'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleConfirm()}
            className={cn(
              'h-9 rounded-md bg-destructive px-3 text-[13px] font-medium text-destructive-foreground transition-opacity',
              'hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {submitting ? 'Deleting…' : 'Delete workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
