import Fastify from 'fastify';
import { mirageAuthPlugin } from '@mirage/auth/fastify';
import { env } from './env.js';
import { connectDb, makeMembershipResolver, type MirageDb } from './db.js';
import { registerWorkspaceRoutes } from './routes/workspaces.js';
import { registerSchemaRoutes } from './routes/schemas.js';
import { registerSetRoutes } from './routes/sets.js';

export async function buildServer(db?: MirageDb) {
  const app = Fastify({
    logger: { level: env.logLevel },
  });

  const database = db ?? (await connectDb());

  await app.register(mirageAuthPlugin, {
    issuer: env.keycloak.issuer,
    jwksUri: env.keycloak.jwksUri,
    resolveMembership: makeMembershipResolver(database),
  });

  app.get('/health', { config: { public: true } }, async () => ({
    status: 'ok',
    service: 'workspace-svc',
  }));

  registerWorkspaceRoutes(app, database);
  registerSchemaRoutes(app, database);
  registerSetRoutes(app, database);

  app.addHook('onClose', async () => {
    await database.client.close();
  });

  return app;
}
