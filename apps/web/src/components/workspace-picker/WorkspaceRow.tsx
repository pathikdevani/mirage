import { ArrowRight } from 'lucide-react';
import type { Api } from '@mirage/types';
import { cn } from '@mirage/ui-kit';
import { colorForId, initialsForName } from './avatar.js';

type WorkspaceDto = Api.components['schemas']['Workspace'];

interface WorkspaceRowProps {
  workspace: WorkspaceDto;
  selected: boolean;
  onSelect: () => void;
}

export function WorkspaceRow({ workspace, selected, onSelect }: WorkspaceRowProps) {
  const color = colorForId(workspace.id);
  const initials = initialsForName(workspace.name);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-brand-violet/40 bg-brand-violet/5'
          : 'border-border bg-background hover:border-brand-violet/30 hover:bg-accent',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 flex-none items-center justify-center rounded-lg text-[12px] font-semibold',
          color.bg,
          color.fg,
        )}
      >
        {initials}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium text-foreground">
            {workspace.name}
          </span>
          <span className="flex h-[18px] items-center gap-1 rounded-full bg-brand-emerald/10 px-1.5 text-[10px] font-medium text-brand-emerald">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-emerald" />
            dev
          </span>
        </div>
        {workspace.description ? (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {workspace.description}
          </p>
        ) : (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            Created {formatDate(workspace.createdAt)} · — members
          </p>
        )}
      </div>

      <ArrowRight
        size={16}
        strokeWidth={1.75}
        className={cn(
          'flex-none text-muted-foreground transition-colors',
          selected ? 'text-brand-violet' : 'group-hover:text-foreground',
        )}
      />
    </button>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
