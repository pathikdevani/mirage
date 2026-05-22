import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Api } from '@mirage/types';
import { useUiStore } from '../../state/store.js';
import { bff } from '../../api/client.js';

type WorkspaceDto = Api.components['schemas']['Workspace'];
import { WorkspaceList } from '../../components/workspace-picker/WorkspaceList.js';
import { WorkspaceDetailCard } from '../../components/workspace-picker/WorkspaceDetailCard.js';
import { WorkspacesEmptyState } from '../../components/workspace-picker/WorkspacesEmptyState.js';

export function WorkspacesPage() {
  const currentOrgId = useUiStore((s) => s.currentOrgId);
  const setCurrentWorkspaceId = useUiStore((s) => s.setCurrentWorkspaceId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const workspaces = useQuery({
    enabled: Boolean(currentOrgId),
    queryKey: ['workspaces', currentOrgId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces');
      if (error) throw error;
      return data;
    },
    // While any row is mid-cascade, poll so the row drops once the cascade
    // hard-deletes it server-side.
    refetchInterval: (query): number | false => {
      const data = query.state.data as WorkspaceDto[] | undefined;
      return data?.some((w) => w.deletedAt) ? 5000 : false;
    },
  });

  // Auto-select the most-recently-updated non-deleted workspace.
  useEffect(() => {
    const live = workspaces.data?.filter((w: WorkspaceDto) => !w.deletedAt) ?? [];
    if (live.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && live.some((w) => w.id === selectedId)) return;
    setSelectedId(live[0]!.id);
  }, [workspaces.data, selectedId]);

  // Mirror the picker's selection into Zustand.
  useEffect(() => {
    if (selectedId) setCurrentWorkspaceId(selectedId);
  }, [selectedId, setCurrentWorkspaceId]);

  if (!currentOrgId) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center text-[13px] text-muted-foreground">
        Select an organization to see its workspaces.
      </div>
    );
  }

  if (workspaces.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-3">
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="h-[420px] animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (workspaces.isError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-[13px] text-destructive">
        Failed to load workspaces.{' '}
        <button
          type="button"
          onClick={() => void workspaces.refetch()}
          className="font-medium underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!workspaces.data || workspaces.data.length === 0) {
    return <WorkspacesEmptyState />;
  }

  const selected = workspaces.data.find((w: WorkspaceDto) => w.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <WorkspaceList
        workspaces={workspaces.data}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      {selected && <WorkspaceDetailCard workspace={selected} />}
    </div>
  );
}
