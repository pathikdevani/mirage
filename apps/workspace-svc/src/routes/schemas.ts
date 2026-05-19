import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import { asId, type Api, type WorkspaceId } from '@mirage/types';
import type { MirageDb, SchemaDoc } from '../db.js';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];
type CreateSchemaBody = Api.components['schemas']['CreateSchemaBody'];

interface ListParams {
  wsId: string;
}
interface ListQuery {
  key?: string;
}
interface IdParams {
  wsId: string;
  id: string;
}

const KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;
const PROP_NAME_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$/;
const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128})$/;

interface ValidationError {
  code: string;
  message: string;
  detail?: unknown;
}

function err(code: string, message: string, detail?: unknown): ValidationError {
  return detail === undefined ? { code, message } : { code, message, detail };
}

function validateProps(properties: SchemaProp[]): ValidationError | null {
  if (!Array.isArray(properties) || properties.length === 0) {
    return err('properties_empty', 'At least one property is required.');
  }
  const queue: { props: SchemaProp[] }[] = [{ props: properties }];
  while (queue.length) {
    const node = queue.shift()!;
    const seen = new Set<string>();
    for (const p of node.props) {
      if (typeof p.name !== 'string' || !PROP_NAME_RE.test(p.name)) {
        return err('property_name_invalid', `Invalid property name: ${p.name}`, { name: p.name });
      }
      if (seen.has(p.name)) {
        return err('property_name_duplicate', `Duplicate property name at this depth: ${p.name}`, { name: p.name });
      }
      seen.add(p.name);

      if (p.type === 'object') {
        if (Array.isArray(p.fields)) queue.push({ props: p.fields });
      } else if (p.type === 'array') {
        if (p.items) {
          // array item: validate type/format/faker rules but skip name uniqueness (single child)
          if (p.items.type === 'object' && Array.isArray(p.items.fields)) {
            queue.push({ props: p.items.fields });
          } else if (p.items.type === 'array' && p.items.items) {
            // recurse via wrapping
            queue.push({ props: [p.items] });
          }
        }
      }
    }
  }
  return null;
}

/** Walk every faker `$ref:` in the tree and return [{ targetKey, fromPath }]. */
function collectRefs(properties: SchemaProp[]): { targetKey: string; targetField: string; fromPath: string }[] {
  const out: { targetKey: string; targetField: string; fromPath: string }[] = [];
  const walk = (props: SchemaProp[], path: string): void => {
    for (const p of props) {
      const nextPath = path ? `${path}.${p.name}` : p.name;
      if (typeof p.faker === 'string') {
        const m = p.faker.match(REF_RE);
        if (m) out.push({ targetKey: m[1]!, targetField: m[2]!, fromPath: nextPath });
      }
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields, nextPath);
      else if (p.type === 'array' && p.items) walk([p.items], `${nextPath}[]`);
    }
  };
  walk(properties, '');
  return out;
}

/** Topological cycle check across schemas (cross-schema only). */
function findCycle(
  newKey: string,
  newRefs: string[],
  existing: { key: string; refs: string[] }[],
): string[] | null {
  const adj = new Map<string, Set<string>>();
  for (const s of existing) adj.set(s.key, new Set(s.refs));
  adj.set(newKey, new Set(newRefs));

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  let cyclePath: string[] | null = null;

  const dfs = (node: string): boolean => {
    color.set(node, GRAY);
    stack.push(node);
    const out = adj.get(node);
    if (out) {
      for (const next of out) {
        if (!adj.has(next)) continue; // ref to non-existent schema — caught elsewhere
        const c = color.get(next) ?? WHITE;
        if (c === GRAY) {
          const startIdx = stack.indexOf(next);
          cyclePath = startIdx >= 0 ? [...stack.slice(startIdx), next] : [next];
          return true;
        }
        if (c === WHITE && dfs(next)) return true;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return false;
  };

  for (const k of adj.keys()) {
    if ((color.get(k) ?? WHITE) === WHITE) {
      if (dfs(k)) return cyclePath;
    }
  }
  return null;
}

export function registerSchemaRoutes(app: FastifyInstance, db: MirageDb): void {
  /** Resolve workspace and enforce tenant scope. Returns workspace or sends a response. */
  const resolveWorkspace = async (
    request: FastifyRequest,
    reply: FastifyReply,
    wsId: string,
  ) => {
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
    '/workspaces/:wsId/schemas',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      const filter: Record<string, unknown> = { workspaceId: request.params.wsId };
      const keyQuery = request.query['key'];
      if (typeof keyQuery === 'string' && keyQuery.length > 0) {
        filter['key'] = keyQuery;
      }
      const list = await db.schemas
        .find(filter as Parameters<typeof db.schemas.find>[0], {
          sort: { updatedAt: -1 },
          limit: 500,
          projection: { _id: 0 },
        })
        .toArray();
      return reply.send(list);
    },
  );

  app.get<{ Params: IdParams }>(
    '/workspaces/:wsId/schemas/:id',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      const row = await db.schemas.findOne(
        { workspaceId: request.params.wsId, id: request.params.id },
        { projection: { _id: 0 } },
      );
      if (!row) return reply.code(404).send({ error: 'schema not found' });
      return reply.send(row);
    },
  );

  app.post<{ Params: ListParams; Body: CreateSchemaBody }>(
    '/workspaces/:wsId/schemas',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      if (ctx.auth.role === 'viewer') {
        return reply.code(403).send({ error: 'viewer cannot create schemas' });
      }
      const body = request.body;

      const trimmedName = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!trimmedName) {
        return reply.code(400).send(err('name_required', '`name` is required'));
      }
      if (typeof body?.key !== 'string' || !KEY_RE.test(body.key)) {
        return reply
          .code(400)
          .send(err('key_invalid', '`key` must match ^[a-z][a-z0-9-]{0,39}$'));
      }
      if (!Array.isArray(body.tags)) {
        return reply.code(400).send(err('key_invalid', '`tags` must be an array'));
      }
      if (typeof body.icon !== 'string' || !body.icon) {
        return reply.code(400).send(err('key_invalid', '`icon` is required'));
      }
      if (
        typeof body.color !== 'string' ||
        !['violet', 'cyan', 'emerald', 'amber', 'rose', 'slate'].includes(body.color)
      ) {
        return reply.code(400).send(err('key_invalid', '`color` must be one of the brand colours'));
      }

      const propErr = validateProps(body.properties as SchemaProp[]);
      if (propErr) {
        return reply.code(400).send({ error: propErr.message, code: propErr.code, detail: propErr.detail });
      }

      const existingByKey = await db.schemas.findOne({
        workspaceId: request.params.wsId,
        key: body.key,
      });
      if (existingByKey) {
        return reply.code(400).send(err('key_taken', '`key` already in use in this workspace'));
      }

      // Resolve refs against current schemas in this workspace.
      const allInWs = await db.schemas
        .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
        .toArray();
      const byKey = new Map<string, SchemaDoc>(allInWs.map((s) => [s.key, s]));

      const refs = collectRefs(body.properties as SchemaProp[]);
      for (const r of refs) {
        if (!byKey.has(r.targetKey)) {
          return reply.code(400).send(
            err('ref_target_missing', `Reference points to missing schema: ${r.targetKey}`, {
              path: r.fromPath,
              targetKey: r.targetKey,
              targetField: r.targetField,
            }),
          );
        }
      }

      // Build cross-schema ref graph for cycle detection.
      const existingForCycle = allInWs.map((s) => ({
        key: s.key,
        refs: Array.from(new Set(collectRefs(s.properties as SchemaProp[]).map((r) => r.targetKey))),
      }));
      const newRefs = Array.from(new Set(refs.map((r) => r.targetKey)));
      const cycle = findCycle(body.key, newRefs, existingForCycle);
      if (cycle) {
        return reply
          .code(400)
          .send(err('cycle_detected', 'Reference graph contains a cycle', { cycle }));
      }

      const now = new Date().toISOString();
      const doc: Schema = {
        id: `sch_${nanoid(16)}`,
        workspaceId: request.params.wsId,
        orgId: ctx.workspace.orgId,
        key: body.key,
        name: trimmedName,
        description: typeof body.description === 'string' ? body.description : '',
        color: body.color,
        icon: body.icon,
        tags: body.tags.filter((t): t is string => typeof t === 'string'),
        properties: body.properties as SchemaProp[],
        createdBy: ctx.auth.userId,
        createdAt: now,
        updatedAt: now,
      };
      await db.schemas.insertOne(doc as SchemaDoc);
      return reply.code(201).send(doc);
    },
  );

  app.delete<{ Params: IdParams }>(
    '/workspaces/:wsId/schemas/:id',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      if (ctx.auth.role === 'viewer') {
        return reply.code(403).send({ error: 'viewer cannot delete schemas' });
      }
      const row = await db.schemas.findOne(
        { workspaceId: request.params.wsId, id: request.params.id },
        { projection: { _id: 0 } },
      );
      if (!row) return reply.code(404).send({ error: 'schema not found' });

      // Reject delete if any other schema in this workspace references this key.
      const peers = await db.schemas
        .find(
          { workspaceId: request.params.wsId, id: { $ne: request.params.id } },
          { projection: { _id: 0 } },
        )
        .toArray();
      const referrers: string[] = [];
      for (const peer of peers) {
        const refs = collectRefs(peer.properties as SchemaProp[]);
        if (refs.some((r) => r.targetKey === row.key)) referrers.push(peer.key);
      }
      if (referrers.length > 0) {
        return reply.code(400).send(
          err('ref_in_use', `Schema is referenced by: ${referrers.join(', ')}`, {
            referrers,
          }),
        );
      }

      await db.schemas.deleteOne({ workspaceId: request.params.wsId, id: request.params.id });
      return reply.code(204).send();
    },
  );
}
