import { cn } from '@mirage/ui-kit';
import type { Api } from '@mirage/types';

type Status = Api.components['schemas']['Run']['status'];

const LABEL: Record<Status, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const CLS: Record<Status, string> = {
  queued: 'bg-muted text-muted-foreground border-border',
  running: 'bg-amber-500/15 text-amber-700 border-amber-400/40 dark:text-amber-300',
  completed: 'bg-emerald-500/15 text-emerald-700 border-emerald-400/40 dark:text-emerald-300',
  failed: 'bg-destructive/15 text-destructive border-destructive/40',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

export function RunStatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-medium',
        CLS[status],
      )}
    >
      {LABEL[status]}
    </span>
  );
}
