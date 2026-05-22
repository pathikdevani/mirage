import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Api } from '@mirage/types';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../api/client.js';
import { useUiStore } from '../../state/store.js';
import { colorForId, initialsForName } from './avatar.js';
import { DeleteWorkspaceModal } from './DeleteWorkspaceModal.js';

type WorkspaceDto = Api.components['schemas']['Workspace'];

interface WorkspaceDetailCardProps {
  workspace: WorkspaceDto;
}

export function WorkspaceDetailCard({ workspace }: WorkspaceDetailCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentOrgId = useUiStore((s) => s.currentOrgId);
  const currentWorkspaceId = useUiStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspaceId = useUiStore((s) => s.setCurrentWorkspaceId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const color = colorForId(workspace.id);
  const initials = initialsForName(workspace.name);
  const deleting = Boolean(workspace.deletedAt);

  const deleteMutation = useMutation({
    mutationFn: async (): Promise<{ id: string; deletedAt: string }> => {
      const { data, error, response } = await bff.DELETE('/workspaces/{id}', {
        params: { path: { id: workspace.id } },
      });
      if (error) {
        const message =
          typeof error === 'object' && error !== null && 'error' in error
            ? String((error as { error?: unknown }).error ?? 'Failed to delete workspace.')
            : `Delete failed (${response.status})`;
        throw new Error(message);
      }
      if (!data) throw new Error('Delete returned no body');
      return data;
    },
    onSuccess: ({ deletedAt }) => {
      // Optimistically mark the row as deleting so the list re-renders
      // immediately; the 5s polling in WorkspacesPage will hard-drop it
      // once the cascade finishes.
      queryClient.setQueryData<WorkspaceDto[]>(
        ['workspaces', currentOrgId],
        (prev) =>
          prev?.map((w) => (w.id === workspace.id ? { ...w, deletedAt } : w)) ?? prev,
      );
      if (currentWorkspaceId === workspace.id) {
        setCurrentWorkspaceId(null);
      }
      setConfirmOpen(false);
    },
  });

  return (
    <div className="flex h-full flex-col gap-5 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Selected workspace
        </span>
        {deleting ? (
          <span className="flex h-[18px] items-center gap-1 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            Deleting…
          </span>
        ) : (
          <span className="flex h-[18px] items-center gap-1 rounded-full bg-brand-emerald/10 px-1.5 text-[10px] font-medium text-brand-emerald">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-emerald" />
            dev
          </span>
        )}
      </div>

      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-12 w-12 flex-none items-center justify-center rounded-lg text-[14px] font-semibold',
            deleting ? 'bg-muted text-muted-foreground' : color.bg,
            deleting ? '' : color.fg,
          )}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-[16px] font-semibold',
              deleting ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {workspace.name}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {workspace.id} · created {formatDate(workspace.createdAt)}
          </div>
        </div>
      </div>

      {workspace.description && (
        <p
          className={cn(
            'text-[13px] leading-relaxed',
            deleting ? 'text-muted-foreground' : 'text-foreground/80',
          )}
        >
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
        disabled={deleting}
        onClick={() => navigate(`/workspaces/${workspace.id}/schemas`)}
        className={cn(
          'flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90',
          deleting && 'cursor-not-allowed opacity-50 hover:opacity-50',
        )}
      >
        Continue to workspace
        <ArrowRight size={16} strokeWidth={2} />
      </button>

      {!deleting && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="flex h-8 items-center justify-center gap-1.5 self-start text-[12px] font-medium text-destructive transition-opacity hover:opacity-80"
        >
          <Trash2 size={13} strokeWidth={2} />
          Delete workspace
        </button>
      )}

      <DeleteWorkspaceModal
        open={confirmOpen}
        workspaceName={workspace.name}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await deleteMutation.mutateAsync();
        }}
      />
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
