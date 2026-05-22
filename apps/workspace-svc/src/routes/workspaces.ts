import type { FastifyInstance } from 'fastify';
import { Job } from 'bullmq';
import { nanoid } from 'nanoid';
import { asId, type RunId, type Workspace, type WorkspaceId } from '@mirage/types';
import type { MirageDb } from '../db.js';
import { cancelFlagKey, runsQueue } from '../queue.js';
import { redis } from '../redis.js';
import type { WorkspaceCascade } from '../workspace-cascade.js';

interface CreateWorkspaceBody {
  name: string;
  description?: string;
}

interface WorkspaceParams {
  id: string;
}

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  db: MirageDb,
  cascade: WorkspaceCascade,
): void {
  app.post<{ Body: CreateWorkspaceBody }>('/workspaces', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthenticated' });
    if (auth.role === 'viewer') {
      return reply.code(403).send({ error: 'viewer cannot create workspaces' });
    }

    const body = request.body;
    if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return reply.code(400).send({ error: '`name` is required' });
    }

    const now = new Date().toISOString();
    const workspace: Workspace = {
      id: asId<WorkspaceId>(`ws_${nanoid(16)}`),
      orgId: auth.orgId,
      name: body.name.trim(),
      ...(body.description ? { description: body.description } : {}),
      createdBy: auth.userId,
      createdAt: now,
      updatedAt: now,
    };
    await db.workspaces.insertOne(workspace);
    return reply.code(201).send(workspace);
  });

  app.get('/workspaces', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthenticated' });

    // Soft-deleted rows are returned so the SPA can render the "Deleting…"
    // state. They drop out naturally once the cascade hard-deletes the row.
    const list = await db.workspaces
      .find({ orgId: auth.orgId }, { sort: { updatedAt: -1 }, limit: 200 })
      .toArray();
    return reply.send(list);
  });

  app.get<{ Params: WorkspaceParams }>('/workspaces/:id', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthenticated' });

    const row = await db.workspaces.findOne({
      orgId: auth.orgId,
      id: asId<WorkspaceId>(request.params.id),
    });
    if (!row) return reply.code(404).send({ error: 'not found' });
    return reply.send(row);
  });

  app.delete<{ Params: WorkspaceParams }>('/workspaces/:id', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthenticated' });

    const id = asId<WorkspaceId>(request.params.id);
    const ws = await db.workspaces.findOne({ orgId: auth.orgId, id });
    if (!ws) return reply.code(404).send({ error: 'not found' });

    // Org owners can delete any workspace; everyone else can only delete
    // workspaces they themselves created.
    if (auth.role !== 'owner' && ws.createdBy !== auth.userId) {
      return reply
        .code(403)
        .send({ error: 'only the workspace creator or an org owner can delete this workspace' });
    }

    if (ws.deletedAt) {
      return reply.code(409).send({ error: 'workspace is already being deleted' });
    }

    const deletedAt = new Date().toISOString();
    await db.workspaces.updateOne({ id }, { $set: { deletedAt } });

    // Cancel in-flight runs: remove still-queued jobs and set the cancel flag
    // for any that have already started. The worker honours the flag at its
    // next checkpoint (see routes/runs.ts cancel endpoint).
    const activeRuns = await db.runs
      .find(
        { workspaceId: id, status: { $in: ['queued', 'running'] } },
        { projection: { id: 1 } },
      )
      .toArray();
    for (const r of activeRuns) {
      const runId = r.id as string;
      try {
        const job = await Job.fromId(runsQueue, runId);
        if (job) await job.remove();
      } catch (err) {
        request.log.warn({ err, runId }, 'failed to remove bullmq job; will rely on cancel flag');
      }
      await redis.set(cancelFlagKey(asId<RunId>(runId)), '1', 'EX', 600);
    }

    cascade.enqueue(id);
    return reply.code(202).send({ id, deletedAt });
  });
}
