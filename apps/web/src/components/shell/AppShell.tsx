import { useEffect } from 'react';
import { Navigate, Outlet, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { useUiStore } from '../../state/store.js';
import { bff } from '../../api/client.js';

export function AppShell() {
  const auth = useAuth();
  const params = useParams<{ wsId: string }>();
  const wsId = params.wsId ?? null;
  const currentOrgId = useUiStore((s) => s.currentOrgId);
  const setCurrentWorkspaceId = useUiStore((s) => s.setCurrentWorkspaceId);

  // URL is the source of truth for the active workspace; mirror to the store so
  // the API middleware (when it starts sending X-Mirage-Workspace) and the TopBar
  // switcher's defaults stay in sync.
  useEffect(() => {
    setCurrentWorkspaceId(wsId);
  }, [wsId, setCurrentWorkspaceId]);

  const workspace = useQuery({
    enabled: Boolean(wsId && currentOrgId && auth.status === 'authenticated'),
    queryKey: ['workspace', wsId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{id}', {
        params: { path: { id: wsId! } },
      });
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-muted-foreground">
        Loading session…
      </div>
    );
  }

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }

  if (!wsId || workspace.isError) {
    return <Navigate to="/workspaces" replace />;
  }

  if (workspace.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] grid-rows-[56px_1fr] bg-background text-foreground">
      <TopBar />
      <Sidebar />
      <main className="overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
