import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { login, logout } from '../auth/oidc.js';
import { useUiStore } from '../state/store.js';
import { bff } from '../api/client.js';

export function HomePage() {
  const auth = useAuth();
  const { currentOrgId, setCurrentOrgId } = useUiStore();
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const workspaces = useQuery({
    enabled: auth.status === 'authenticated' && Boolean(currentOrgId),
    queryKey: ['workspaces', currentOrgId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces');
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (input: { name: string }) => {
      const { data, error } = await bff.POST('/workspaces', { body: input });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['workspaces', currentOrgId] });
    },
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Mirage</h1>
      <p className="mt-2 text-muted-foreground">
        Define data shapes, bundle them into Sets, generate realistic fake data.
      </p>

      <section className="mt-10 rounded-lg border bg-card p-6">
        <h2 className="text-lg font-medium">Auth</h2>
        {auth.status === 'loading' && (
          <p className="mt-2 text-sm text-muted-foreground">Loading session…</p>
        )}
        {auth.status === 'anonymous' && (
          <button
            type="button"
            onClick={() => void login()}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in with Keycloak
          </button>
        )}
        {auth.status === 'authenticated' && auth.user && (
          <div className="mt-2 space-y-3 text-sm">
            <p>
              Signed in as <strong>{auth.user.profile.preferred_username}</strong> (
              {auth.user.profile.email})
            </p>
            <div>
              <label className="block text-xs text-muted-foreground" htmlFor="org-input">
                X-Mirage-Org
              </label>
              <input
                id="org-input"
                className="mt-1 w-48 rounded-md border bg-background px-2 py-1 text-sm"
                value={currentOrgId ?? ''}
                onChange={(e) => setCurrentOrgId(e.target.value || null)}
                placeholder="acme"
              />
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
            >
              Sign out
            </button>
          </div>
        )}
      </section>

      {auth.status === 'authenticated' && currentOrgId && (
        <section className="mt-6 rounded-lg border bg-card p-6">
          <h2 className="text-lg font-medium">Workspaces</h2>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length === 0) return;
              create.mutate({ name: name.trim() });
            }}
          >
            <input
              className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New workspace name"
            />
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
          </form>
          {create.isError && (
            <p className="mt-2 text-xs text-destructive">{(create.error as Error).message}</p>
          )}

          <ul className="mt-4 space-y-1 text-sm">
            {workspaces.isLoading && <li className="text-muted-foreground">Loading…</li>}
            {workspaces.isError && (
              <li className="text-destructive">{(workspaces.error as Error).message}</li>
            )}
            {workspaces.data?.map((ws) => (
              <li key={ws.id} className="rounded border px-3 py-2">
                <div className="font-medium">{ws.name}</div>
                <div className="text-xs text-muted-foreground">{ws.id}</div>
              </li>
            ))}
            {workspaces.data?.length === 0 && (
              <li className="text-muted-foreground">No workspaces yet — create one above.</li>
            )}
          </ul>
        </section>
      )}
    </main>
  );
}
