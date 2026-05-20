import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { mirageAuthPlugin } from '@mirage/auth/fastify';
import type { Role, UserId, OrgId } from '@mirage/types';
import { env } from './env.js';
import { registerHealthRoute } from './routes/health.js';
import { registerMeRoute } from './routes/me.js';
import { registerWorkspaceProxyRoutes } from './routes/workspaces.js';
import { registerSchemaProxyRoutes } from './routes/schemas.js';
import { registerSetProxyRoutes } from './routes/sets.js';
import { registerCustomFunctionProxyRoutes } from './routes/custom-functions.js';
import { registerRunProxyRoutes } from './routes/runs.js';
import { registerWsRoute } from './routes/ws.js';

export type Server = Awaited<ReturnType<typeof buildServer>>;

/**
 * Build the Fastify app. Kept pure (no `listen`) so main.ts owns the
 * lifecycle and the same builder can be reused by tests later.
 */
export async function buildServer() {
  const app = Fastify({
    logger: { level: env.logLevel },
    disableRequestLogging: false,
  });

  await app.register(cors, {
    origin: env.webOrigin,
    credentials: true,
    allowedHeaders: ['authorization', 'content-type', 'x-mirage-org'],
  });
  await app.register(websocket);

  await app.register(mirageAuthPlugin, {
    issuer: env.keycloak.issuer,
    jwksUri: env.keycloak.jwksUri,
    // TODO(T17): replace with the real workspace-svc lookup. Until membership
    // collections exist, every authenticated user is treated as `editor` of
    // any org they belong to (verified by the Keycloak group check).
    resolveMembership: async (_userId: UserId, _orgId: OrgId) => ({ role: 'editor' as Role }),
  });

  registerHealthRoute(app);
  registerMeRoute(app);
  registerWorkspaceProxyRoutes(app);
  registerSchemaProxyRoutes(app);
  registerSetProxyRoutes(app);
  registerCustomFunctionProxyRoutes(app);
  registerRunProxyRoutes(app);
  registerWsRoute(app);

  return app;
}
