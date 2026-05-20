import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import { asId, type Api, type WorkspaceId } from '@mirage/types';
import type { MirageDb, SetDoc } from '../db.js';
import {
  err,
  normalizeAndValidateSetBody,
  pruneOrphanOverrides,
  validateInclusionsAndComputeEdges,
} from './_setHelpers.js';

type Set = Api.components['schemas']['Set'];
type CreateSetBody = Api.components['schemas']['CreateSetBody'];
type UpdateSetBody = Api.components['schemas']['UpdateSetBody'];
type SetEdge = Api.components['schemas']['SetEdge'];

interface ListParams {
  wsId: string;
}
interface IdParams {
  wsId: string;
  id: string;
}

export function registerSetRoutes(app: FastifyInstance, db: MirageDb): void {
  const resolveWorkspace = async (request: FastifyRequest, reply: FastifyReply, wsId: string) => {
    const auth = request.auth;
    if (!auth) {
      await reply.code(401).send({ error: 'unauthenticated' });
      return null;
    }
    const ws = await db.workspaces.findOne({ id: asId<WorkspaceId>(wsId) });
    if (!ws || ws.orgId !== auth.orgId) {
      await reply.code(404).send({ error: 'workspace not found' });
      return null;
    }
    return { auth, workspace: ws };
  };

  app.get<{ Params: ListParams }>('/workspaces/:wsId/sets', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    const list = await db.sets
      .find(
        { workspaceId: request.params.wsId },
        { sort: { updatedAt: -1 }, limit: 500, projection: { _id: 0 } },
      )
      .toArray();
    return reply.send(list);
  });

  app.get<{ Params: IdParams }>('/workspaces/:wsId/sets/:id', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    const row = await db.sets.findOne(
      { workspaceId: request.params.wsId, id: request.params.id },
      { projection: { _id: 0 } },
    );
    if (!row) return reply.code(404).send({ error: 'set not found' });
    return reply.send(row);
  });

  app.get<{ Params: IdParams }>('/workspaces/:wsId/sets/:id/edges', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    const row = await db.sets.findOne(
      { workspaceId: request.params.wsId, id: request.params.id },
      { projection: { _id: 0 } },
    );
    if (!row) return reply.code(404).send({ error: 'set not found' });
    const wsSchemas = await db.schemas
      .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
      .toArray();
    const result = validateInclusionsAndComputeEdges(wsSchemas, row.schemas);
    if ('code' in result) {
      // Schema referenced by the set is missing — surface as empty edges,
      // the StrategiesTab will explain via the missing-inclusion banner.
      return reply.send([]);
    }
    const edges: SetEdge[] = result.edges;
    return reply.send(edges);
  });

  app.post<{ Params: ListParams; Body: CreateSetBody }>(
    '/workspaces/:wsId/sets',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      if (ctx.auth.role === 'viewer') {
        return reply.code(403).send({ error: 'viewer cannot create sets' });
      }
      const normalized = normalizeAndValidateSetBody(request.body);
      if ('code' in normalized) {
        return reply
          .code(400)
          .send({ error: normalized.message, code: normalized.code, detail: normalized.detail });
      }

      const existingByKey = await db.sets.findOne({
        workspaceId: request.params.wsId,
        key: normalized.key,
      });
      if (existingByKey) {
        return reply.code(400).send(err('key_taken', '`key` already in use in this workspace'));
      }

      const wsSchemas = await db.schemas
        .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
        .toArray();
      const incCheck = validateInclusionsAndComputeEdges(wsSchemas, normalized.schemas);
      if ('code' in incCheck) {
        return reply
          .code(400)
          .send({ error: incCheck.message, code: incCheck.code, detail: incCheck.detail });
      }

      const cleanedStrategies = pruneOrphanOverrides(normalized.strategies, incCheck.edges);

      const now = new Date().toISOString();
      const doc: Set = {
        id: `set_${nanoid(16)}`,
        workspaceId: request.params.wsId,
        orgId: ctx.workspace.orgId,
        key: normalized.key,
        name: normalized.name,
        description: normalized.description,
        color: normalized.color,
        icon: normalized.icon,
        tags: normalized.tags,
        salt: normalized.salt,
        schemas: normalized.schemas,
        strategies: cleanedStrategies,
        output: normalized.output,
        createdBy: ctx.auth.userId,
        createdAt: now,
        updatedAt: now,
      };
      await db.sets.insertOne(doc as SetDoc);
      return reply.code(201).send(doc);
    },
  );

  app.put<{ Params: IdParams; Body: UpdateSetBody }>(
    '/workspaces/:wsId/sets/:id',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      if (ctx.auth.role === 'viewer') {
        return reply.code(403).send({ error: 'viewer cannot update sets' });
      }
      const body = request.body;
      if (typeof body?.expectedUpdatedAt !== 'string') {
        return reply.code(400).send(err('key_invalid', '`expectedUpdatedAt` is required'));
      }

      const existing = await db.sets.findOne(
        { workspaceId: request.params.wsId, id: request.params.id },
        { projection: { _id: 0 } },
      );
      if (!existing) return reply.code(404).send({ error: 'set not found' });

      if (existing.updatedAt !== body.expectedUpdatedAt) {
        return reply.code(409).send(
          err('stale_update', 'Set was modified by someone else', {
            currentUpdatedAt: existing.updatedAt,
          }),
        );
      }

      const normalized = normalizeAndValidateSetBody(body);
      if ('code' in normalized) {
        return reply
          .code(400)
          .send({ error: normalized.message, code: normalized.code, detail: normalized.detail });
      }

      if (normalized.key !== existing.key) {
        const collision = await db.sets.findOne({
          workspaceId: request.params.wsId,
          key: normalized.key,
          id: { $ne: request.params.id },
        });
        if (collision) {
          return reply.code(400).send(err('key_taken', '`key` already in use in this workspace'));
        }
      }

      const wsSchemas = await db.schemas
        .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
        .toArray();
      const incCheck = validateInclusionsAndComputeEdges(wsSchemas, normalized.schemas);
      if ('code' in incCheck) {
        return reply
          .code(400)
          .send({ error: incCheck.message, code: incCheck.code, detail: incCheck.detail });
      }
      const cleanedStrategies = pruneOrphanOverrides(normalized.strategies, incCheck.edges);

      const now = new Date().toISOString();
      const updated: Set = {
        ...(existing as Set),
        key: normalized.key,
        name: normalized.name,
        description: normalized.description,
        color: normalized.color,
        icon: normalized.icon,
        tags: normalized.tags,
        salt: normalized.salt,
        schemas: normalized.schemas,
        strategies: cleanedStrategies,
        output: normalized.output,
        updatedAt: now,
      };

      const res = await db.sets.updateOne(
        {
          workspaceId: request.params.wsId,
          id: request.params.id,
          updatedAt: existing.updatedAt,
        },
        { $set: { ...updated } },
      );
      if (res.matchedCount === 0) {
        return reply.code(409).send(err('stale_update', 'Set was modified by someone else', {}));
      }
      return reply.send(updated);
    },
  );

  app.delete<{ Params: IdParams }>('/workspaces/:wsId/sets/:id', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    if (ctx.auth.role === 'viewer') {
      return reply.code(403).send({ error: 'viewer cannot delete sets' });
    }
    const row = await db.sets.findOne(
      { workspaceId: request.params.wsId, id: request.params.id },
      { projection: { _id: 0 } },
    );
    if (!row) return reply.code(404).send({ error: 'set not found' });
    await db.sets.deleteOne({ workspaceId: request.params.wsId, id: request.params.id });
    return reply.code(204).send();
  });
}
