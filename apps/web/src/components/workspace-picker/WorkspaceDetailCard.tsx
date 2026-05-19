import { useNavigate } from 'react-router';
import { ArrowRight } from 'lucide-react';
import type { Api } from '@mirage/types';
import { cn } from '@mirage/ui-kit';
import { colorForId, initialsForName } from './avatar.js';

type WorkspaceDto = Api.components['schemas']['Workspace'];

interface WorkspaceDetailCardProps {
  workspace: WorkspaceDto;
}

export function WorkspaceDetailCard({ workspace }: WorkspaceDetailCardProps) {
  const navigate = useNavigate();
  const color = colorForId(workspace.id);
  const initials = initialsForName(workspace.name);

  return (
    <div className="flex h-full flex-col gap-5 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Selected workspace
        </span>
        <span className="flex h-[18px] items-center gap-1 rounded-full bg-brand-emerald/10 px-1.5 text-[10px] font-medium text-brand-emerald">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-emerald" />
          dev
        </span>
      </div>

      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-12 w-12 flex-none items-center justify-center rounded-lg text-[14px] font-semibold',
            color.bg,
            color.fg,
          )}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold text-foreground">
            {workspace.name}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {workspace.id} · created {formatDate(workspace.createdAt)}
          </div>
        </div>
      </div>

      {workspace.description && (
        <p className="text-[13px] leading-relaxed text-foreground/80">
          {workspace.description}
        </p>
      )}

      <div className="grid grid-cols-4 gap-2 border-y border-border py-4">
        <Stat label="Schemas" value="—" />
        <Stat label="Sets" value="—" />
        <Stat label="Total rows" value="—" />
        <Stat label="Members" value="—" />
      </div>

      <div className="flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Recent activity
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">No activity yet.</p>
      </div>

      <button
        type="button"
        onClick={() => navigate(`/workspaces/${workspace.id}/schemas`)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Continue to workspace
        <ArrowRight size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
