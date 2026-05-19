import { QueryClient } from '@tanstack/react-query';
import createClient, { type Middleware } from 'openapi-fetch';
import type { Api } from '@mirage/types';
import { userManager } from '../auth/oidc.js';
import { env } from '../env.js';
import { useUiStore } from '../state/store.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Auth middleware: attaches the Keycloak access token + the currently-selected
 * Org id (TECH_ARCHITECHRE.md §3.6) to every BFF request.
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const user = await userManager.getUser();
    if (user?.access_token) {
      request.headers.set('Authorization', `Bearer ${user.access_token}`);
    }
    const orgId = useUiStore.getState().currentOrgId;
    if (orgId) request.headers.set('X-Mirage-Org', orgId);
    return request;
  },
};

/**
 * Typed BFF client. Every endpoint is shape-checked against
 * `packages/types/openapi.yaml` at compile time. Hit endpoints as e.g.
 * `bff.GET('/workspaces')`, `bff.POST('/workspaces', { body: {...} })`.
 */
export const bff = createClient<Api.paths>({ baseUrl: env.bffUrl });
bff.use(authMiddleware);
