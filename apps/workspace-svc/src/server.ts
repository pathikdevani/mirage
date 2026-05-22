import Fastify from 'fastify';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type ObjectIdentifier,
} from '@aws-sdk/client-s3';
import { mirageAuthPlugin } from '@mirage/auth/fastify';
import { asId, type WorkspaceId } from '@mirage/types';
import { env } from './env.js';
import { connectDb, makeMembershipResolver, type MirageDb } from './db.js';
import { registerWorkspaceRoutes } from './routes/workspaces.js';
import { registerSchemaRoutes } from './routes/schemas.js';
import { registerSetRoutes } from './routes/sets.js';
import { registerCustomFunctionRoutes } from './routes/custom-functions.js';
import { registerRunRoutes } from './routes/runs.js';
import { shutdownSandbox } from './sandbox-singleton.js';
import { s3 } from './s3.js';
import { createWorkspaceCascade, type WorkspaceCascade } from './workspace-cascade.js';

export async function buildServer(db?: MirageDb): Promise<ReturnType<typeof Fastify> & {
  cascade: WorkspaceCascade;
}> {
  const app = Fastify({
    logger: { level: env.logLevel },
  });

  const database = db ?? (await connectDb());

  await app.register(mirageAuthPlugin, {
    issuer: env.keycloak.issuer,
    jwksUri: env.keycloak.jwksUri,
    resolveMembership: makeMembershipResolver(database),
  });

  const cascade = createWorkspaceCascade({
    log: app.log,
    ports: {
      async countActiveRuns(workspaceId) {
        return database.runs.countDocuments({
          workspaceId,
          status: { $in: ['queued', 'running'] },
        });
      },

      async lookupSoftDeleted(workspaceId) {
        const ws = await database.workspaces.findOne(
          { id: asId<WorkspaceId>(workspaceId) },
          { projection: { orgId: 1, deletedAt: 1 } },
        );
        if (!ws || !ws.deletedAt) return null;
        return { orgId: ws.orgId as string };
      },

      async listSoftDeleted() {
        const rows = await database.workspaces
          .find({ deletedAt: { $exists: true } }, { projection: { id: 1 } })
          .toArray();
        return rows.map((r) => r.id as WorkspaceId);
      },

      async purgeS3Prefix(orgId, workspaceId) {
        const prefix = `org/${orgId}/workspace/${workspaceId}/`;
        let continuationToken: string | undefined;
        do {
          const list = await s3.send(
            new ListObjectsV2Command({
              Bucket: env.s3.bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }),
          );
          const keys: ObjectIdentifier[] = [];
          for (const c of list.Contents ?? []) {
            if (c.Key) keys.push({ Key: c.Key });
          }
          if (keys.length > 0) {
            await s3.send(
              new DeleteObjectsCommand({
                Bucket: env.s3.bucket,
                Delete: { Objects: keys, Quiet: true },
              }),
            );
          }
          continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
        } while (continuationToken);
      },

      async purgeMongo(workspaceId) {
        // Leaves first, workspace row last. deleteMany on no matches is a no-op.
        await database.runs.deleteMany({ workspaceId });
        await database.customFunctions.deleteMany({ workspaceId });
        await database.sets.deleteMany({ workspaceId });
        await database.schemas.deleteMany({ workspaceId });
        // Only workspace-scoped membership rows have `workspaceId`; org-level
        // rows have no such field and are untouched.
        await database.memberships.deleteMany({ workspaceId });
        await database.workspaces.deleteOne({ id: asId<WorkspaceId>(workspaceId) });
      },
    },
  });

  app.get('/health', { config: { public: true } }, async () => ({
    status: 'ok',
    service: 'workspace-svc',
  }));

  registerWorkspaceRoutes(app, database, cascade);
  registerSchemaRoutes(app, database);
  registerSetRoutes(app, database);
  registerCustomFunctionRoutes(app, database);
  registerRunRoutes(app, database);

  app.addHook('onClose', async () => {
    await database.client.close();
    await shutdownSandbox();
  });

  void cascade.runStartupSweep();

  return Object.assign(app, { cascade });
}
