import Fastify from 'fastify';
import { mirageAuthPlugin } from '@mirage/auth/fastify';
import type { OrgId, Role, UserId } from '@mirage/types';
import { env } from './env.js';
import { registerExportRoutes } from './routes/export.js';

export async function buildServer() {
  const app = Fastify({ logger: { level: env.logLevel } });

  await app.register(mirageAuthPlugin, {
    issuer: env.keycloak.issuer,
    jwksUri: env.keycloak.jwksUri,
    // TODO(T17): replace with HTTP call to workspace-svc once that's wired.
    resolveMembership: async (_userId: UserId, _orgId: OrgId) => ({ role: 'editor' as Role }),
  });

  app.get('/health', { config: { public: true } }, async () => ({
    status: 'ok',
    service: 'export-svc',
  }));

  registerExportRoutes(app);

  return app;
}
