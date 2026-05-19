import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { asId, type Workspace, type WorkspaceId } from '@mirage/types';
import type { MirageDb } from '../db.js';

interface CreateWorkspaceBody {
  name: string;
  description?: string;
}

interface WorkspaceParams {
  id: string;
}

export function registerWorkspaceRoutes(app: FastifyInstance, db: MirageDb): void {
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
}
