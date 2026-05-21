import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ClientSession } from 'mongodb';
import { nanoid } from 'nanoid';
import { asId, type Api, type WorkspaceId } from '@mirage/types';
import {
  customFunctionRegistryFromMap,
  dryRunSchema,
  type CustomFunctionEntry,
} from '@mirage/engine';
import type { MirageDb, SchemaDoc } from '../db.js';
import { getSandbox } from '../sandbox-singleton.js';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];
type CreateSchemaBody = Api.components['schemas']['CreateSchemaBody'];
type UpdateSchemaBody = Api.components['schemas']['UpdateSchemaBody'];

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
        return err('property_name_duplicate', `Duplicate property name at this depth: ${p.name}`, {
          name: p.name,
        });
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

const FN_PREFIX_RE = /^\$fn:(cfn_[A-Za-z0-9_-]{16})$/;

/** Walk every faker `$fn:` in the tree and return [{ functionId, fromPath }]. */
function collectFnRefs(properties: SchemaProp[]): { functionId: string; fromPath: string }[] {
  const out: { functionId: string; fromPath: string }[] = [];
  const walk = (props: SchemaProp[], path: string): void => {
    for (const p of props) {
      const nextPath = path ? `${path}.${p.name}` : p.name;
      if (typeof p.faker === 'string') {
        const m = p.faker.match(FN_PREFIX_RE);
        if (m) out.push({ functionId: m[1]!, fromPath: nextPath });
      }
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields, nextPath);
      else if (p.type === 'array' && p.items) walk([p.items], `${nextPath}[]`);
    }
  };
  walk(properties, '');
  return out;
}

/** Walk every faker `$ref:` in the tree and return [{ targetKey, fromPath }]. */
function collectRefs(
  properties: SchemaProp[],
): { targetKey: string; targetField: string; fromPath: string }[] {
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

/** Rewrite any `$ref:<oldKey>(.field…)?` in a property tree to `$ref:<newKey>(.field…)?`.
 *  Returns true if the tree was mutated in place. */
function rewriteRefsInTree(props: SchemaProp[], oldKey: string, newKey: string): boolean {
  const prefix = `$ref:${oldKey}`;
  let changed = false;
  const walk = (arr: SchemaProp[]): void => {
    for (const p of arr) {
      if (typeof p.faker === 'string' && p.faker.startsWith(prefix)) {
        const remainder = p.faker.slice(prefix.length);
        if (remainder === '' || remainder.startsWith('.')) {
          p.faker = `$ref:${newKey}${remainder}`;
          changed = true;
        }
      }
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields);
      else if (p.type === 'array' && p.items) walk([p.items]);
    }
  };
  walk(props);
  return changed;
}

function detectCycleInGraph(graph: { key: string; refs: string[] }[]): string[] | null {
  const adj = new Map<string, Set<string>>();
  for (const s of graph) adj.set(s.key, new Set(s.refs));
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  let result: string[] | null = null;
  const dfs = (node: string): boolean => {
    color.set(node, GRAY);
    stack.push(node);
    const out = adj.get(node);
    if (out) {
      for (const next of out) {
        if (!adj.has(next)) continue;
        const c = color.get(next) ?? WHITE;
        if (c === GRAY) {
          const i = stack.indexOf(next);
          result = i >= 0 ? [...stack.slice(i), next] : [next];
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
    if ((color.get(k) ?? WHITE) === WHITE && dfs(k)) return result;
  }
  return null;
}

function isReplicaSetUnsupported(e: unknown): boolean {
  return e instanceof Error && /replica set|Transaction numbers/i.test(e.message);
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

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
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

interface NormalizedBody {
  name: string;
  key: string;
  description: string;
  color: 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';
  icon: string;
  tags: string[];
  properties: SchemaProp[];
}

function normalizeAndValidateBody(
  body: CreateSchemaBody | UpdateSchemaBody,
): NormalizedBody | ValidationError {
  const trimmedName = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!trimmedName) return err('name_required', '`name` is required');
  if (typeof body?.key !== 'string' || !KEY_RE.test(body.key)) {
    return err('key_invalid', '`key` must match ^[a-z][a-z0-9-]{0,39}$');
  }
  if (!Array.isArray(body.tags)) return err('key_invalid', '`tags` must be an array');
  if (typeof body.icon !== 'string' || !body.icon) {
    return err('key_invalid', '`icon` is required');
  }
  const colors = ['violet', 'cyan', 'emerald', 'amber', 'rose', 'slate'] as const;
  if (typeof body.color !== 'string' || !colors.includes(body.color as (typeof colors)[number])) {
    return err('key_invalid', '`color` must be one of the brand colours');
  }
  const propErr = validateProps(body.properties as SchemaProp[]);
  if (propErr) return propErr;
  return {
    name: trimmedName,
    key: body.key,
    description: typeof body.description === 'string' ? body.description : '',
    color: body.color as NormalizedBody['color'],
    icon: body.icon,
    tags: body.tags.filter((t): t is string => typeof t === 'string'),
    properties: body.properties as SchemaProp[],
  };
}

export function registerSchemaRoutes(app: FastifyInstance, db: MirageDb): void {
  /** Resolve workspace and enforce tenant scope. Returns workspace or sends a response. */
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

  app.post<{
    Params: ListParams;
    Querystring: { count?: string };
    Body: Api.components['schemas']['DryRunSchemaBody'];
  }>('/workspaces/:wsId/schemas/dry-run', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;

    const draftBody = request.body?.schema;
    if (!draftBody || typeof draftBody !== 'object') {
      return reply.code(400).send(err('schema_required', '`schema` body field is required'));
    }
    const normalized = normalizeAndValidateBody(draftBody);
    if ('code' in normalized) {
      return reply
        .code(422)
        .send({ error: normalized.message, code: normalized.code, detail: normalized.detail });
    }

    const rawCount = request.query.count;
    let count = rawCount === undefined ? 1 : Number.parseInt(rawCount, 10);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > 10) count = 10;

    const salt = typeof request.body?.salt === 'string' && request.body.salt.length > 0
      ? request.body.salt
      : `preview:${request.params.wsId}:${normalized.key}`;

    const allInWs = await db.schemas
      .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
      .toArray();
    const byKey = new Map<string, SchemaDoc>(allInWs.map((s) => [s.key, s]));

    const referencedSchemas = new Map<string, Api.components['schemas']['Schema']>();
    const refs = collectRefs(normalized.properties);
    for (const r of refs) {
      if (referencedSchemas.has(r.targetKey)) continue;
      const target = byKey.get(r.targetKey);
      if (target) referencedSchemas.set(r.targetKey, target as Api.components['schemas']['Schema']);
    }

    const fnRefs = collectFnRefs(normalized.properties);
    const fnMap = new Map<string, CustomFunctionEntry>();
    if (fnRefs.length > 0) {
      const ids = Array.from(new Set(fnRefs.map((r) => r.functionId)));
      const fns = await db.customFunctions
        .find(
          { workspaceId: request.params.wsId, id: { $in: ids } },
          { projection: { _id: 0 } },
        )
        .toArray();
      for (const f of fns) fnMap.set(f.id, { source: f.source, usage: f.usage });
    }
    const registry = customFunctionRegistryFromMap(fnMap);

    const draftSchema: Api.components['schemas']['Schema'] = {
      id: 'sch_preview',
      workspaceId: request.params.wsId,
      orgId: ctx.workspace.orgId,
      key: normalized.key,
      name: normalized.name,
      description: normalized.description,
      color: normalized.color,
      icon: normalized.icon,
      tags: normalized.tags,
      properties: normalized.properties,
      createdBy: ctx.auth.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Api.components['schemas']['Schema'];

    try {
      const result = await dryRunSchema({
        draft: draftSchema,
        referencedSchemas,
        count,
        salt,
        locale: 'en',
        customFunctions: registry,
        sandbox: getSandbox(),
      });
      return reply.send(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'preview generation failed';
      return reply.code(500).send(err('preview_failed', msg));
    }
  });

  app.get<{ Params: IdParams }>('/workspaces/:wsId/schemas/:id', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    const row = await db.schemas.findOne(
      { workspaceId: request.params.wsId, id: request.params.id },
      { projection: { _id: 0 } },
    );
    if (!row) return reply.code(404).send({ error: 'schema not found' });
    return reply.send(row);
  });

  app.post<{ Params: ListParams; Body: CreateSchemaBody }>(
    '/workspaces/:wsId/schemas',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      if (ctx.auth.role === 'viewer') {
        return reply.code(403).send({ error: 'viewer cannot create schemas' });
      }
      const body = request.body;
      const normalized = normalizeAndValidateBody(body);
      if ('code' in normalized) {
        return reply
          .code(400)
          .send({ error: normalized.message, code: normalized.code, detail: normalized.detail });
      }

      const existingByKey = await db.schemas.findOne({
        workspaceId: request.params.wsId,
        key: normalized.key,
      });
      if (existingByKey) {
        return reply.code(400).send(err('key_taken', '`key` already in use in this workspace'));
      }

      // Resolve refs against current schemas in this workspace.
      const allInWs = await db.schemas
        .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
        .toArray();
      const byKey = new Map<string, SchemaDoc>(allInWs.map((s) => [s.key, s]));

      const refs = collectRefs(normalized.properties);
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

      // Validate $fn references — target must exist with usage ∈ {valueGenerator, both}
      const fnRefs = collectFnRefs(normalized.properties);
      if (fnRefs.length > 0) {
        const ids = Array.from(new Set(fnRefs.map((r) => r.functionId)));
        const fns = await db.customFunctions
          .find(
            { workspaceId: request.params.wsId, id: { $in: ids } },
            { projection: { _id: 0 } },
          )
          .toArray();
        const byId = new Map(fns.map((f) => [f.id, f]));
        for (const r of fnRefs) {
          const fn = byId.get(r.functionId);
          if (!fn) {
            return reply.code(400).send(
              err('fn_target_missing', `Function not found: ${r.functionId}`, {
                path: r.fromPath,
                functionId: r.functionId,
              }),
            );
          }
          if (fn.usage === 'strategy') {
            return reply.code(400).send(
              err(
                'fn_usage_mismatch',
                `Function ${fn.name} is a Strategy function and cannot be a Value Generator`,
                { path: r.fromPath, functionId: r.functionId, functionUsage: fn.usage },
              ),
            );
          }
        }
      }

      // Build cross-schema ref graph for cycle detection.
      const existingForCycle = allInWs.map((s) => ({
        key: s.key,
        refs: Array.from(
          new Set(collectRefs(s.properties as SchemaProp[]).map((r) => r.targetKey)),
        ),
      }));
      const newRefs = Array.from(new Set(refs.map((r) => r.targetKey)));
      const cycle = findCycle(normalized.key, newRefs, existingForCycle);
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
        key: normalized.key,
        name: normalized.name,
        description: normalized.description,
        color: normalized.color,
        icon: normalized.icon,
        tags: normalized.tags,
        properties: normalized.properties,
        createdBy: ctx.auth.userId,
        createdAt: now,
        updatedAt: now,
      };
      await db.schemas.insertOne(doc as SchemaDoc);
      return reply.code(201).send(doc);
    },
  );

  app.put<{ Params: IdParams; Body: UpdateSchemaBody }>(
    '/workspaces/:wsId/schemas/:id',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      if (ctx.auth.role === 'viewer') {
        return reply.code(403).send({ error: 'viewer cannot update schemas' });
      }
      const body = request.body;
      if (typeof body?.expectedUpdatedAt !== 'string') {
        return reply.code(400).send(err('key_invalid', '`expectedUpdatedAt` is required'));
      }

      const existing = await db.schemas.findOne(
        { workspaceId: request.params.wsId, id: request.params.id },
        { projection: { _id: 0 } },
      );
      if (!existing) return reply.code(404).send({ error: 'schema not found' });

      if (existing.updatedAt !== body.expectedUpdatedAt) {
        return reply.code(409).send(
          err('stale_update', 'Schema was modified by someone else', {
            currentUpdatedAt: existing.updatedAt,
          }),
        );
      }

      const normalized = normalizeAndValidateBody(body);
      if ('code' in normalized) {
        return reply
          .code(400)
          .send({ error: normalized.message, code: normalized.code, detail: normalized.detail });
      }

      // Key-uniqueness check (only if changed).
      if (normalized.key !== existing.key) {
        const collision = await db.schemas.findOne({
          workspaceId: request.params.wsId,
          key: normalized.key,
          id: { $ne: request.params.id },
        });
        if (collision) {
          return reply.code(400).send(err('key_taken', '`key` already in use in this workspace'));
        }
      }

      const allInWs = await db.schemas
        .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
        .toArray();
      const byKey = new Map<string, SchemaDoc>(allInWs.map((s) => [s.key, s]));
      // Treat target schema as present under its new key for ref resolution.
      byKey.delete(existing.key);
      byKey.set(normalized.key, existing as SchemaDoc);

      const refs = collectRefs(normalized.properties);
      for (const r of refs) {
        if (r.targetKey === normalized.key) continue; // self-ref allowed; cycle check is separate
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

      // Validate $fn references — target must exist with usage ∈ {valueGenerator, both}
      const fnRefs = collectFnRefs(normalized.properties);
      if (fnRefs.length > 0) {
        const ids = Array.from(new Set(fnRefs.map((r) => r.functionId)));
        const fns = await db.customFunctions
          .find(
            { workspaceId: request.params.wsId, id: { $in: ids } },
            { projection: { _id: 0 } },
          )
          .toArray();
        const byId = new Map(fns.map((f) => [f.id, f]));
        for (const r of fnRefs) {
          const fn = byId.get(r.functionId);
          if (!fn) {
            return reply.code(400).send(
              err('fn_target_missing', `Function not found: ${r.functionId}`, {
                path: r.fromPath,
                functionId: r.functionId,
              }),
            );
          }
          if (fn.usage === 'strategy') {
            return reply.code(400).send(
              err(
                'fn_usage_mismatch',
                `Function ${fn.name} is a Strategy function and cannot be a Value Generator`,
                { path: r.fromPath, functionId: r.functionId, functionUsage: fn.usage },
              ),
            );
          }
        }
      }

      const otherSchemas = allInWs.filter((s) => s.id !== existing.id);
      const existingForCycle = otherSchemas.map((s) => ({
        key: s.key,
        refs: Array.from(
          new Set(collectRefs(s.properties as SchemaProp[]).map((r) => r.targetKey)),
        ),
      }));
      const newRefs = Array.from(new Set(refs.map((r) => r.targetKey)));
      const cycle = findCycle(normalized.key, newRefs, existingForCycle);
      if (cycle) {
        return reply
          .code(400)
          .send(err('cycle_detected', 'Reference graph contains a cycle', { cycle }));
      }

      const keyChanged = normalized.key !== existing.key;
      const now = new Date().toISOString();
      const updated: Schema = {
        ...(existing as Schema),
        key: normalized.key,
        name: normalized.name,
        description: normalized.description,
        color: normalized.color,
        icon: normalized.icon,
        tags: normalized.tags,
        properties: normalized.properties,
        updatedAt: now,
      };

      if (keyChanged) {
        const state: { error: ValidationError | null } = { error: null };

        const runCascade = async (session: ClientSession | null): Promise<void> => {
          const sessionOpt = session ? { session } : {};
          // 1. Update the target schema (with optimistic concurrency).
          const res = await db.schemas.updateOne(
            {
              workspaceId: request.params.wsId,
              id: request.params.id,
              updatedAt: existing.updatedAt,
            },
            { $set: { ...updated } },
            sessionOpt,
          );
          if (res.matchedCount === 0) {
            state.error = err('stale_update', 'Schema was modified by someone else', {});
            if (session) await session.abortTransaction();
            return;
          }

          // 2. Rewrite peer refs.
          const peers = await db.schemas
            .find(
              { workspaceId: request.params.wsId, id: { $ne: request.params.id } },
              { projection: { _id: 0 }, ...sessionOpt },
            )
            .toArray();
          for (const peer of peers) {
            const peerProps = peer.properties as SchemaProp[];
            if (rewriteRefsInTree(peerProps, existing.key, normalized.key)) {
              await db.schemas.updateOne(
                { workspaceId: request.params.wsId, id: peer.id },
                { $set: { properties: peerProps, updatedAt: now } },
                sessionOpt,
              );
            }
          }

          // 2b. Rewrite Set inclusions + strategy overrides for this workspace.
          //     A Set may include the renamed schema by key (in `schemas[]`) or
          //     reference it from a strategy override (`strategies[].schemaKey`).
          const setsInWs = await db.sets
            .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 }, ...sessionOpt })
            .toArray();
          for (const setDoc of setsInWs) {
            let touched = false;
            const newInclusions = setDoc.schemas.map((inc) => {
              if (inc.schemaKey === existing.key) {
                touched = true;
                return { ...inc, schemaKey: normalized.key };
              }
              return inc;
            });
            const newStrategies = setDoc.strategies.map((ov) => {
              if (ov.schemaKey === existing.key) {
                touched = true;
                return { ...ov, schemaKey: normalized.key };
              }
              return ov;
            });
            if (touched) {
              await db.sets.updateOne(
                { workspaceId: request.params.wsId, id: setDoc.id },
                {
                  $set: { schemas: newInclusions, strategies: newStrategies, updatedAt: now },
                },
                sessionOpt,
              );
            }
          }

          // 3. Re-run cycle detection against the post-rename state.
          const after = await db.schemas
            .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 }, ...sessionOpt })
            .toArray();
          const graph = after.map((s) => ({
            key: s.key,
            refs: Array.from(
              new Set(collectRefs(s.properties as SchemaProp[]).map((r) => r.targetKey)),
            ),
          }));
          const cycleAfter = detectCycleInGraph(graph);
          if (cycleAfter) {
            state.error = err('key_rewrite_failed', 'Renaming this key would introduce a cycle', {
              cycle: cycleAfter,
            });
            if (session) await session.abortTransaction();
            return;
          }
        };

        const session = db.client.startSession();
        try {
          try {
            await session.withTransaction(async () => {
              await runCascade(session);
            });
          } catch (e) {
            if (!isReplicaSetUnsupported(e)) throw e;
            // Local dev mongo isn't a replica set — fall back to sequential writes.
            // TODO: require replica-set in dev so the cascade is atomic.
            request.log.warn(
              { err: e },
              'mongo is not a replica set; running key-rename cascade non-transactionally',
            );
            state.error = null;
            await runCascade(null);
          }
        } finally {
          await session.endSession();
        }

        if (state.error) {
          const code = state.error.code === 'stale_update' ? 409 : 400;
          return reply.code(code).send({
            error: state.error.message,
            code: state.error.code,
            detail: state.error.detail,
          });
        }
        return reply.send(updated);
      }

      await db.schemas.updateOne(
        { workspaceId: request.params.wsId, id: request.params.id, updatedAt: existing.updatedAt },
        { $set: { ...updated } },
      );
      return reply.send(updated);
    },
  );

  app.delete<{ Params: IdParams }>('/workspaces/:wsId/schemas/:id', async (request, reply) => {
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

    // Also reject if any Set in this workspace includes this schema.
    const setReferrers: string[] = [];
    const setsInWs = await db.sets
      .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
      .toArray();
    for (const s of setsInWs) {
      if (s.schemas.some((inc) => inc.schemaKey === row.key)) {
        setReferrers.push(s.key);
      }
    }
    if (setReferrers.length > 0) {
      return reply
        .code(400)
        .send(
          err(
            'ref_in_use_by_set',
            `Schema is included in set${setReferrers.length === 1 ? '' : 's'}: ${setReferrers.join(', ')}`,
            { setReferrers },
          ),
        );
    }

    await db.schemas.deleteOne({ workspaceId: request.params.wsId, id: request.params.id });
    return reply.code(204).send();
  });
}
