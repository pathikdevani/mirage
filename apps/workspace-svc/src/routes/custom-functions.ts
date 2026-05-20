import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import { extractFnRefs } from '@mirage/engine';
import { asId, type Api, type WorkspaceId } from '@mirage/types';
import type { MirageDb, CustomFunctionDoc } from '../db.js';

type CustomFunction = Api.components['schemas']['CustomFunction'];
type CreateBody = Api.components['schemas']['CreateCustomFunctionBody'];
type UpdateBody = Api.components['schemas']['UpdateCustomFunctionBody'];

interface ListParams {
  wsId: string;
}
interface ListQuery {
  usage?: 'valueGenerator' | 'strategy' | 'both';
}
interface IdParams {
  wsId: string;
  id: string;
}

const NAME_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$/;
const USAGES = ['valueGenerator', 'strategy', 'both'] as const;

interface ValidationError {
  code: string;
  message: string;
  detail?: unknown;
}
function err(code: string, message: string, detail?: unknown): ValidationError {
  return detail === undefined ? { code, message } : { code, message, detail };
}

interface Normalized {
  name: string;
  description: string;
  usage: (typeof USAGES)[number];
  source: string;
}

function normalize(body: CreateBody | UpdateBody): Normalized | ValidationError {
  if (typeof body?.name !== 'string' || !NAME_RE.test(body.name)) {
    return err('name_invalid', '`name` must be a JavaScript-style identifier');
  }
  if (!USAGES.includes(body.usage as (typeof USAGES)[number])) {
    return err('usage_invalid', '`usage` must be valueGenerator, strategy, or both');
  }
  if (typeof body.source !== 'string' || body.source.length < 1 || body.source.length > 20000) {
    return err('source_invalid', '`source` must be a 1..20000 character string');
  }
  // Parse-only validity check. NOT executed.
  try {
    new Function('ctx', body.source);
  } catch (e) {
    return err('invalid_js', 'Source is not valid JavaScript', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return {
    name: body.name,
    description: typeof body.description === 'string' ? body.description : '',
    usage: body.usage as (typeof USAGES)[number],
    source: body.source,
  };
}

export function registerCustomFunctionRoutes(app: FastifyInstance, db: MirageDb): void {
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

  app.get<{ Params: ListParams; Querystring: ListQuery }>(
    '/workspaces/:wsId/custom-functions',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      const filter: Record<string, unknown> = { workspaceId: request.params.wsId };
      const usage = request.query['usage'];
      if (usage === 'valueGenerator' || usage === 'strategy') {
        filter['usage'] = { $in: [usage, 'both'] };
      } else if (usage === 'both') {
        filter['usage'] = 'both';
      }
      const list = await db.customFunctions
        .find(filter as Parameters<typeof db.customFunctions.find>[0], {
          sort: { updatedAt: -1 },
          limit: 500,
          projection: { _id: 0 },
        })
        .toArray();
      return reply.send(list);
    },
  );

  app.get<{ Params: IdParams }>(
    '/workspaces/:wsId/custom-functions/:id',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      const row = await db.customFunctions.findOne(
        { workspaceId: request.params.wsId, id: request.params.id },
        { projection: { _id: 0 } },
      );
      if (!row) return reply.code(404).send({ error: 'function not found' });
      return reply.send(row);
    },
  );

  app.post<{ Params: ListParams; Body: CreateBody }>(
    '/workspaces/:wsId/custom-functions',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      if (ctx.auth.role === 'viewer') {
        return reply.code(403).send({ error: 'viewer cannot create functions' });
      }
      const normalized = normalize(request.body);
      if ('code' in normalized) {
        return reply
          .code(400)
          .send({ error: normalized.message, code: normalized.code, detail: normalized.detail });
      }

      const existingByName = await db.customFunctions.findOne({
        workspaceId: request.params.wsId,
        name: normalized.name,
      });
      if (existingByName) {
        return reply.code(400).send(err('name_taken', '`name` already in use in this workspace'));
      }

      const now = new Date().toISOString();
      const doc: CustomFunction = {
        id: `cfn_${nanoid(16)}`,
        workspaceId: request.params.wsId,
        orgId: ctx.workspace.orgId,
        name: normalized.name,
        description: normalized.description,
        usage: normalized.usage,
        source: normalized.source,
        createdBy: ctx.auth.userId,
        createdAt: now,
        updatedAt: now,
      };
      await db.customFunctions.insertOne(doc as CustomFunctionDoc);
      return reply.code(201).send(doc);
    },
  );

  app.put<{ Params: IdParams; Body: UpdateBody }>(
    '/workspaces/:wsId/custom-functions/:id',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      if (ctx.auth.role === 'viewer') {
        return reply.code(403).send({ error: 'viewer cannot update functions' });
      }
      const body = request.body;
      if (typeof body?.expectedUpdatedAt !== 'string') {
        return reply.code(400).send(err('name_invalid', '`expectedUpdatedAt` is required'));
      }

      const existing = await db.customFunctions.findOne(
        { workspaceId: request.params.wsId, id: request.params.id },
        { projection: { _id: 0 } },
      );
      if (!existing) return reply.code(404).send({ error: 'function not found' });
      if (existing.updatedAt !== body.expectedUpdatedAt) {
        return reply.code(409).send(
          err('stale_update', 'Function was modified by someone else', {
            currentUpdatedAt: existing.updatedAt,
          }),
        );
      }

      const normalized = normalize(body);
      if ('code' in normalized) {
        return reply
          .code(400)
          .send({ error: normalized.message, code: normalized.code, detail: normalized.detail });
      }

      if (normalized.name !== existing.name) {
        const collision = await db.customFunctions.findOne({
          workspaceId: request.params.wsId,
          name: normalized.name,
          id: { $ne: request.params.id },
        });
        if (collision) {
          return reply.code(400).send(err('name_taken', '`name` already in use in this workspace'));
        }
      }

      // Usage-narrowing checks
      const losingGenerator = existing.usage !== 'strategy' && normalized.usage === 'strategy';
      const losingStrategy =
        existing.usage !== 'valueGenerator' && normalized.usage === 'valueGenerator';

      if (losingGenerator) {
        const allSchemas = await db.schemas
          .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
          .toArray();
        const offending = extractFnRefs(allSchemas).filter(
          (r) => r.functionId === request.params.id,
        );
        if (offending.length > 0) {
          const schemaKeys = Array.from(new Set(offending.map((r) => r.schemaKey)));
          return reply
            .code(400)
            .send(
              err(
                'usage_in_use_as_generator',
                `Function is still used as a Value Generator by: ${schemaKeys.join(', ')}`,
                { schemaKeys },
              ),
            );
        }
      }
      if (losingStrategy) {
        const allSets = await db.sets
          .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
          .toArray();
        const setKeys: string[] = [];
        for (const s of allSets) {
          for (const ov of s.strategies) {
            if (
              ov.strategy.type === 'custom' &&
              (ov.strategy as { functionId: string }).functionId === request.params.id
            ) {
              setKeys.push(s.key);
              break;
            }
          }
        }
        if (setKeys.length > 0) {
          return reply
            .code(400)
            .send(
              err(
                'usage_in_use_as_strategy',
                `Function is still used as a Strategy by: ${setKeys.join(', ')}`,
                { setKeys },
              ),
            );
        }
      }

      const now = new Date().toISOString();
      const updated: CustomFunction = {
        ...(existing as CustomFunction),
        name: normalized.name,
        description: normalized.description,
        usage: normalized.usage,
        source: normalized.source,
        updatedAt: now,
      };

      const res = await db.customFunctions.updateOne(
        {
          workspaceId: request.params.wsId,
          id: request.params.id,
          updatedAt: existing.updatedAt,
        },
        { $set: { ...updated } },
      );
      if (res.matchedCount === 0) {
        return reply
          .code(409)
          .send(err('stale_update', 'Function was modified by someone else', {}));
      }
      return reply.send(updated);
    },
  );

  app.delete<{ Params: IdParams }>(
    '/workspaces/:wsId/custom-functions/:id',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      if (ctx.auth.role === 'viewer') {
        return reply.code(403).send({ error: 'viewer cannot delete functions' });
      }
      const row = await db.customFunctions.findOne(
        { workspaceId: request.params.wsId, id: request.params.id },
        { projection: { _id: 0 } },
      );
      if (!row) return reply.code(404).send({ error: 'function not found' });

      const allSchemas = await db.schemas
        .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
        .toArray();
      const schemaReferrers = Array.from(
        new Set(
          extractFnRefs(allSchemas)
            .filter((r) => r.functionId === request.params.id)
            .map((r) => r.schemaKey),
        ),
      );
      if (schemaReferrers.length > 0) {
        return reply
          .code(400)
          .send(
            err(
              'ref_in_use_by_schema',
              `Function is referenced by schemas: ${schemaReferrers.join(', ')}`,
              { schemaKeys: schemaReferrers },
            ),
          );
      }

      const allSets = await db.sets
        .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
        .toArray();
      const setReferrers: string[] = [];
      for (const s of allSets) {
        for (const ov of s.strategies) {
          if (
            ov.strategy.type === 'custom' &&
            (ov.strategy as { functionId: string }).functionId === request.params.id
          ) {
            setReferrers.push(s.key);
            break;
          }
        }
      }
      if (setReferrers.length > 0) {
        return reply
          .code(400)
          .send(
            err('ref_in_use_by_set', `Function is referenced by sets: ${setReferrers.join(', ')}`, {
              setKeys: setReferrers,
            }),
          );
      }

      await db.customFunctions.deleteOne({
        workspaceId: request.params.wsId,
        id: request.params.id,
      });
      return reply.code(204).send();
    },
  );
}
