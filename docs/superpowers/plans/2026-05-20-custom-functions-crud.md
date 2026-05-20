# Custom Functions CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship full CRUD for Custom Functions (workspace-level JavaScript saved as named function expressions), plus the integration that re-enables the "custom" option on the Schema property's Value Generator picker and the Set's Strategy picker. No execution — saved source is parse-validated only.

**Architecture:** New `custom_functions` Mongo collection in workspace-svc. A pure `extractFnRefs` helper in `@mirage/engine` is shared by server (delete-check + narrowing-check) and SPA (Used-by panel). BFF proxies the new routes. SPA gets a new top-level Functions page (list + Monaco editor + Usage panel) plus a single-screen Create modal. The Schema's `FakerCell` picker grows a third group, and the Set `StrategiesTab`'s "Custom function" tile becomes interactive with a function picker.

**Tech Stack:** TypeScript strict ESM, Fastify 5, MongoDB driver, openapi-typescript + openapi-fetch, React 19 + Vite + Tailwind v4 + shadcn, TanStack Query 5, React Router 7, `@monaco-editor/react`, Lucide icons, nanoid.

**Verification model:** Same as the Sets slice — no automated tests per [TECH_ARCHITECHRE.md §5](../../TECH_ARCHITECHRE.md). Every task ends with `nx typecheck,lint` on the touched projects plus `prettier --check`. **Do not commit** per project memory; leave changes uncommitted for review.

**Spec:** [docs/superpowers/specs/2026-05-20-custom-functions-crud-design.md](../specs/2026-05-20-custom-functions-crud-design.md).

---

## File map

**Created:**

| Path | Responsibility |
|---|---|
| `packages/engine/src/extract-fn-refs.ts` | Pure helper: walks schema property trees, returns every `$fn:<id>` reference |
| `apps/workspace-svc/src/routes/custom-functions.ts` | CRUD + JS-validity + usage-narrowing + delete-check |
| `apps/bff/src/routes/custom-functions.ts` | BFF proxy |
| `apps/web/src/pages/dashboard/FunctionsPage.tsx` | Router-level page (replaces no current entry) |
| `apps/web/src/pages/dashboard/functions/lib/types.ts` | Re-exports of `Api.CustomFunction` etc. |
| `apps/web/src/pages/dashboard/functions/lib/monacoTypes.ts` | Ambient `.d.ts` string for Monaco's `addExtraLib` |
| `apps/web/src/pages/dashboard/functions/lib/validate.ts` | Client preflight |
| `apps/web/src/pages/dashboard/functions/lib/mapServerError.ts` | Error mapping |
| `apps/web/src/pages/dashboard/functions/useFunctionBuffer.ts` | Draft + dirty tracking |
| `apps/web/src/pages/dashboard/functions/ListPane.tsx` | Left column: function list |
| `apps/web/src/pages/dashboard/functions/EditPane.tsx` | Middle: name/usage/Monaco + SaveBar |
| `apps/web/src/pages/dashboard/functions/UsagePane.tsx` | Right: schemas + sets that reference this function |
| `apps/web/src/pages/dashboard/functions/CreateFunctionModal.tsx` | Single-screen create modal |

**Modified:**

| Path | Why |
|---|---|
| `packages/types/openapi.yaml` | Add `CustomFunction`, `CreateCustomFunctionBody`, `UpdateCustomFunctionBody`, the 5 routes, and the `custom` Strategy variant |
| `packages/engine/src/index.ts` | Re-export `extract-fn-refs.ts` |
| `apps/workspace-svc/src/db.ts` | Add `custom_functions` collection + indexes + `CustomFunctionDoc` |
| `apps/workspace-svc/src/server.ts` | Register `registerCustomFunctionRoutes` |
| `apps/workspace-svc/src/routes/schemas.ts` | Validate `$fn:<id>` references on save (target exists + usage compatible) |
| `apps/workspace-svc/src/routes/sets.ts` | Validate `strategy.type === 'custom'` `functionId` refs on save |
| `apps/bff/src/server.ts` | Register `registerCustomFunctionProxyRoutes` |
| `apps/web/src/components/shell/nav-config.ts` | Add Functions sidebar item |
| `apps/web/src/router.tsx` | Add `/workspaces/:wsId/functions` route |
| `apps/web/src/pages/dashboard/schemas/PropertyEditor/FakerCell.tsx` | Add a third group: Custom functions |
| `apps/web/src/pages/dashboard/schemas/lib/types.ts` | Export `FN_PREFIX` sentinel |
| `apps/web/src/pages/dashboard/sets/StrategiesTab.tsx` | Re-enable the "Custom function" tile + function picker dropdown |

---

## Task 1: Add Custom Function types to the OpenAPI spec

**Files:**
- Modify: `packages/types/openapi.yaml`

- [ ] **Step 1: Add the 5 routes under `paths:`**

Insert after the `/workspaces/{wsId}/sets/{id}/edges` block:

```yaml
  /workspaces/{wsId}/custom-functions:
    parameters:
      - in: path
        name: wsId
        required: true
        schema: { type: string }
    get:
      summary: List Custom Functions in a Workspace
      operationId: listCustomFunctions
      parameters:
        - in: query
          name: usage
          required: false
          schema: { type: string, enum: [valueGenerator, strategy, both] }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/CustomFunction' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
    post:
      summary: Create a Custom Function
      operationId: createCustomFunction
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateCustomFunctionBody' }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CustomFunction' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }

  /workspaces/{wsId}/custom-functions/{id}:
    parameters:
      - in: path
        name: wsId
        required: true
        schema: { type: string }
      - in: path
        name: id
        required: true
        schema: { type: string }
    get:
      summary: Get a Custom Function by id
      operationId: getCustomFunction
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CustomFunction' }
        '404': { $ref: '#/components/responses/NotFound' }
    put:
      summary: Update a Custom Function
      operationId: updateCustomFunction
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateCustomFunctionBody' }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CustomFunction' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }
    delete:
      summary: Delete a Custom Function
      operationId: deleteCustomFunction
      responses:
        '204': { description: Deleted }
        '400': { $ref: '#/components/responses/BadRequest' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
```

- [ ] **Step 2: Add the component schemas**

Inside `components.schemas:`, after `SetEdge`, add:

```yaml
    CustomFunction:
      type: object
      required:
        - id
        - workspaceId
        - orgId
        - name
        - description
        - usage
        - source
        - createdBy
        - createdAt
        - updatedAt
      additionalProperties: false
      properties:
        id: { type: string }
        workspaceId: { type: string }
        orgId: { type: string }
        name:
          type: string
          pattern: '^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$'
        description: { type: string, maxLength: 500 }
        usage: { type: string, enum: [valueGenerator, strategy, both] }
        source: { type: string, minLength: 1, maxLength: 20000 }
        createdBy: { type: string }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }

    CreateCustomFunctionBody:
      type: object
      required: [name, usage, source]
      additionalProperties: false
      properties:
        name:
          type: string
          pattern: '^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$'
        description: { type: string, maxLength: 500 }
        usage: { type: string, enum: [valueGenerator, strategy, both] }
        source: { type: string, minLength: 1, maxLength: 20000 }

    UpdateCustomFunctionBody:
      type: object
      required: [name, usage, source, expectedUpdatedAt]
      additionalProperties: false
      properties:
        name:
          type: string
          pattern: '^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$'
        description: { type: string, maxLength: 500 }
        usage: { type: string, enum: [valueGenerator, strategy, both] }
        source: { type: string, minLength: 1, maxLength: 20000 }
        expectedUpdatedAt: { type: string, format: date-time }
```

- [ ] **Step 3: Add the `custom` variant to the existing Strategy oneOf**

Find the existing `Strategy:` schema (added in the Sets slice). Append a fourth entry to its `oneOf`:

```yaml
        - type: object
          required: [type, functionId]
          additionalProperties: false
          properties:
            type: { type: string, enum: ['custom'] }
            functionId: { type: string }
```

- [ ] **Step 4: Regenerate types**

```bash
pnpm --filter @mirage/types run gen
```

Expected: writes `packages/types/src/openapi.generated.ts`, exits 0.

- [ ] **Step 5: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/types --skip-nx-cache
pnpm exec prettier --check packages/types
```

Expected: all green.

---

## Task 2: Add `extractFnRefs` to `@mirage/engine`

**Files:**
- Create: `packages/engine/src/extract-fn-refs.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Create `extract-fn-refs.ts`**

```ts
import type { Api } from '@mirage/types';

/**
 * Walk every schema's property tree and yield every `$fn:<id>` reference.
 * Mirrors extract-set-edges.ts in shape — operates on the OpenAPI Schema shape
 * (array-of-props with `faker: "$fn:<id>"` strings).
 */

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

export interface FnRef {
  schemaKey: string;
  /** Dotted path; `[]` separates array property names. */
  fieldPath: string;
  functionId: string;
}

const FN_RE = /^\$fn:(cfn_[A-Za-z0-9_-]{16})$/;

export function extractFnRefs(schemas: ReadonlyArray<Schema>): FnRef[] {
  const out: FnRef[] = [];
  for (const schema of schemas) {
    walk(schema.properties, '', schema.key, out);
  }
  return out;
}

function walk(
  props: SchemaProp[],
  basePath: string,
  schemaKey: string,
  out: FnRef[],
): void {
  for (const p of props) {
    const path = basePath ? `${basePath}.${p.name}` : p.name;
    if (typeof p.faker === 'string') {
      const m = p.faker.match(FN_RE);
      if (m) {
        out.push({ schemaKey, fieldPath: path, functionId: m[1]! });
      }
    }
    if (p.type === 'object' && Array.isArray(p.fields)) {
      walk(p.fields, path, schemaKey, out);
    } else if (p.type === 'array' && p.items) {
      walk([p.items], `${path}[]`, schemaKey, out);
    }
  }
}
```

- [ ] **Step 2: Re-export**

Append to `packages/engine/src/index.ts`:

```ts
export * from './extract-fn-refs.js';
```

- [ ] **Step 3: Smoke test**

Run from the repo root:

```bash
cat > /tmp/fn-refs-smoke.mts <<'EOF'
import { extractFnRefs } from '/Users/pathik.devani/Desktop/Gitlab/mirage/packages/engine/src/extract-fn-refs.ts';
const schemas = [
  { key: 'person', properties: [
    { name: 'name', type: 'string', required: true, faker: '$fn:cfn_abcdef0123456789' },
    { name: 'addresses', type: 'array', required: false, items: {
      name: 'item', type: 'object', required: false, fields: [
        { name: 'city', type: 'string', required: true, faker: '$fn:cfn_1234567890abcdef' },
        { name: 'plain', type: 'string', required: true, faker: 'person.firstName' },
      ],
    }},
  ]},
] as any;
console.log(JSON.stringify(extractFnRefs(schemas), null, 2));
EOF
pnpm --filter @mirage/bff exec tsx /tmp/fn-refs-smoke.mts
```

Expected: two refs — `person.name` → `cfn_abcdef0123456789` and `person.addresses[].item.city` → `cfn_1234567890abcdef`. The plain faker method is ignored.

- [ ] **Step 4: Typecheck + lint**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/engine --skip-nx-cache
pnpm exec prettier --check packages/engine
```

Expected: green.

---

## Task 3: Add `custom_functions` collection in workspace-svc

**Files:**
- Modify: `apps/workspace-svc/src/db.ts`

- [ ] **Step 1: Add `CustomFunctionDoc` next to `SetDoc`**

```ts
export type SchemaDoc = Api.components['schemas']['Schema'];
export type SetDoc = Api.components['schemas']['Set'];
export type CustomFunctionDoc = Api.components['schemas']['CustomFunction'];
```

- [ ] **Step 2: Add the collection to `MirageDb` and `connectDb()`**

```ts
export interface MirageDb {
  client: MongoClient;
  db: Db;
  workspaces: Collection<Workspace>;
  memberships: Collection<Membership>;
  schemas: Collection<SchemaDoc>;
  sets: Collection<SetDoc>;
  customFunctions: Collection<CustomFunctionDoc>;
}
```

Inside `connectDb()`, after `const sets = db.collection<SetDoc>('sets');`:

```ts
  const customFunctions = db.collection<CustomFunctionDoc>('custom_functions');

  await Promise.all([
    // ... existing index calls ...
    sets.createIndex({ workspaceId: 1, key: 1 }, { unique: true }),
    sets.createIndex({ workspaceId: 1, updatedAt: -1 }),
    sets.createIndex({ orgId: 1, workspaceId: 1 }),
    customFunctions.createIndex({ workspaceId: 1, name: 1 }, { unique: true }),
    customFunctions.createIndex({ workspaceId: 1, updatedAt: -1 }),
    customFunctions.createIndex({ orgId: 1, workspaceId: 1 }),
  ]);

  return { client, db, workspaces, memberships, schemas, sets, customFunctions };
}
```

- [ ] **Step 3: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/workspace-svc --skip-nx-cache
pnpm exec prettier --check apps/workspace-svc
```

Expected: green.

---

## Task 4: Implement Custom Function CRUD routes in workspace-svc

**Files:**
- Create: `apps/workspace-svc/src/routes/custom-functions.ts`
- Modify: `apps/workspace-svc/src/server.ts`

- [ ] **Step 1: Create `custom-functions.ts`**

```ts
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
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
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
      const losingGenerator =
        existing.usage !== 'strategy' && normalized.usage === 'strategy';
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
          return reply.code(400).send(
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
          return reply.code(400).send(
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

      // Schema referrers
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
        return reply.code(400).send(
          err(
            'ref_in_use_by_schema',
            `Function is referenced by schemas: ${schemaReferrers.join(', ')}`,
            { schemaKeys: schemaReferrers },
          ),
        );
      }

      // Set referrers
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
        return reply.code(400).send(
          err(
            'ref_in_use_by_set',
            `Function is referenced by sets: ${setReferrers.join(', ')}`,
            { setKeys: setReferrers },
          ),
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
```

- [ ] **Step 2: Register in `server.ts`**

```ts
// Imports
import { registerCustomFunctionRoutes } from './routes/custom-functions.js';

// In buildServer(), after registerSetRoutes:
  registerSetRoutes(app, database);
  registerCustomFunctionRoutes(app, database);
```

- [ ] **Step 3: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/workspace-svc --skip-nx-cache
pnpm exec prettier --write apps/workspace-svc/src/routes/custom-functions.ts apps/workspace-svc/src/server.ts
pnpm exec prettier --check apps/workspace-svc
```

Expected: green.

---

## Task 5: Validate `$fn:` refs when saving schemas

**Files:**
- Modify: `apps/workspace-svc/src/routes/schemas.ts`

The existing `collectRefs` walks the property tree and picks up `$ref:` strings. Add a sibling walker for `$fn:` and gate schema saves on the targets existing with compatible `usage`.

- [ ] **Step 1: Add a `collectFnRefs` helper**

In the helpers section of `schemas.ts`, alongside `collectRefs`:

```ts
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
```

- [ ] **Step 2: Validate function refs in the POST handler**

In the POST `/workspaces/:wsId/schemas` handler, after the existing `for (const r of refs)` loop that checks `ref_target_missing`, add:

```ts
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
```

- [ ] **Step 3: Mirror in the PUT handler**

In the PUT `/workspaces/:wsId/schemas/:id` handler, after the existing `for (const r of refs)` loop, add the **identical** block from Step 2 (same code, runs against the new properties).

- [ ] **Step 4: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/workspace-svc --skip-nx-cache
pnpm exec prettier --write apps/workspace-svc/src/routes/schemas.ts
pnpm exec prettier --check apps/workspace-svc
```

Expected: green.

---

## Task 6: Validate `custom` strategy `functionId` refs when saving sets

**Files:**
- Modify: `apps/workspace-svc/src/routes/sets.ts`

- [ ] **Step 1: Add a `validateStrategyFunctions` helper**

At the top of `sets.ts` (after the imports), add:

```ts
async function validateStrategyFunctions(
  db: MirageDb,
  wsId: string,
  strategies: Array<{
    schemaKey: string;
    fieldPath: string;
    strategy: { type: string; functionId?: string };
  }>,
): Promise<{ code: string; message: string; detail?: unknown } | null> {
  const ids = Array.from(
    new Set(
      strategies
        .filter((o) => o.strategy.type === 'custom' && typeof o.strategy.functionId === 'string')
        .map((o) => o.strategy.functionId!),
    ),
  );
  if (ids.length === 0) return null;
  const fns = await db.customFunctions
    .find({ workspaceId: wsId, id: { $in: ids } }, { projection: { _id: 0 } })
    .toArray();
  const byId = new Map(fns.map((f) => [f.id, f]));
  for (const ov of strategies) {
    if (ov.strategy.type !== 'custom') continue;
    const fnId = ov.strategy.functionId;
    if (!fnId) continue;
    const fn = byId.get(fnId);
    if (!fn) {
      return {
        code: 'fn_target_missing',
        message: `Function not found: ${fnId}`,
        detail: { schemaKey: ov.schemaKey, fieldPath: ov.fieldPath, functionId: fnId },
      };
    }
    if (fn.usage === 'valueGenerator') {
      return {
        code: 'fn_usage_mismatch',
        message: `Function ${fn.name} is a Value Generator and cannot be a Strategy`,
        detail: {
          schemaKey: ov.schemaKey,
          fieldPath: ov.fieldPath,
          functionId: fnId,
          functionUsage: fn.usage,
        },
      };
    }
  }
  return null;
}
```

Note: this function reads `db.customFunctions` so it must be defined inside this module's file scope alongside the other helpers; pass `db` to it from the route handlers. The import of `MirageDb` already exists in `sets.ts`.

- [ ] **Step 2: Call from POST and PUT**

In the POST handler, after the `cleanedStrategies = pruneOrphanOverrides(...)` line:

```ts
      const fnErr = await validateStrategyFunctions(db, request.params.wsId, cleanedStrategies);
      if (fnErr) {
        return reply
          .code(400)
          .send({ error: fnErr.message, code: fnErr.code, detail: fnErr.detail });
      }
```

Do the **same** in the PUT handler at the equivalent position (after its `cleanedStrategies = ...`).

- [ ] **Step 3: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/workspace-svc --skip-nx-cache
pnpm exec prettier --write apps/workspace-svc/src/routes/sets.ts
pnpm exec prettier --check apps/workspace-svc
```

Expected: green.

---

## Task 7: BFF proxy for /custom-functions routes

**Files:**
- Create: `apps/bff/src/routes/custom-functions.ts`
- Modify: `apps/bff/src/server.ts`

- [ ] **Step 1: Create the proxy module**

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

async function forward(
  request: FastifyRequest,
  reply: FastifyReply,
  targetPath: string,
): Promise<void> {
  const url = `${env.workspaceSvcUrl}${targetPath}`;
  const headers: Record<string, string> = {};
  if (request.headers.authorization) {
    headers['authorization'] = request.headers.authorization;
  }
  const orgHeader = request.headers['x-mirage-org'];
  if (typeof orgHeader === 'string') headers['x-mirage-org'] = orgHeader;
  if (request.headers['content-type']) {
    headers['content-type'] = String(request.headers['content-type']);
  }

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    init.body = JSON.stringify(request.body);
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    request.log.error({ err, url }, 'workspace-svc unreachable');
    return reply.code(502).send({ error: 'workspace-svc unreachable' });
  }
  const text = await upstream.text();
  reply.code(upstream.status);
  const ct = upstream.headers.get('content-type');
  if (ct) reply.header('content-type', ct);
  return reply.send(text);
}

export function registerCustomFunctionProxyRoutes(app: FastifyInstance): void {
  app.get<{ Params: { wsId: string }; Querystring: { usage?: string } }>(
    '/workspaces/:wsId/custom-functions',
    (req, reply) => {
      const usage = req.query['usage'];
      const qs = typeof usage === 'string' && usage.length > 0
        ? `?usage=${encodeURIComponent(usage)}`
        : '';
      return forward(
        req,
        reply,
        `/workspaces/${encodeURIComponent(req.params.wsId)}/custom-functions${qs}`,
      );
    },
  );
  app.post<{ Params: { wsId: string } }>(
    '/workspaces/:wsId/custom-functions',
    (req, reply) =>
      forward(req, reply, `/workspaces/${encodeURIComponent(req.params.wsId)}/custom-functions`),
  );
  app.get<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/custom-functions/:id',
    (req, reply) =>
      forward(
        req,
        reply,
        `/workspaces/${encodeURIComponent(req.params.wsId)}/custom-functions/${encodeURIComponent(req.params.id)}`,
      ),
  );
  app.put<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/custom-functions/:id',
    (req, reply) =>
      forward(
        req,
        reply,
        `/workspaces/${encodeURIComponent(req.params.wsId)}/custom-functions/${encodeURIComponent(req.params.id)}`,
      ),
  );
  app.delete<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/custom-functions/:id',
    (req, reply) =>
      forward(
        req,
        reply,
        `/workspaces/${encodeURIComponent(req.params.wsId)}/custom-functions/${encodeURIComponent(req.params.id)}`,
      ),
  );
}
```

- [ ] **Step 2: Register in `apps/bff/src/server.ts`**

```ts
import { registerCustomFunctionProxyRoutes } from './routes/custom-functions.js';
// ...

  registerSetProxyRoutes(app);
  registerCustomFunctionProxyRoutes(app);
  registerWsRoute(app);
```

- [ ] **Step 3: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/bff --skip-nx-cache
pnpm exec prettier --write apps/bff/src/routes/custom-functions.ts apps/bff/src/server.ts
pnpm exec prettier --check apps/bff
```

Expected: green.

---

## Task 8: SPA shared lib for Functions

**Files:**
- Create: `apps/web/src/pages/dashboard/functions/lib/types.ts`
- Create: `apps/web/src/pages/dashboard/functions/lib/monacoTypes.ts`
- Create: `apps/web/src/pages/dashboard/functions/lib/validate.ts`
- Create: `apps/web/src/pages/dashboard/functions/lib/mapServerError.ts`

- [ ] **Step 1: Create `types.ts`**

```ts
import type { Api } from '@mirage/types';

export type CustomFunction = Api.components['schemas']['CustomFunction'];
export type CreateCustomFunctionBody = Api.components['schemas']['CreateCustomFunctionBody'];
export type UpdateCustomFunctionBody = Api.components['schemas']['UpdateCustomFunctionBody'];

export const NAME_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$/;
export const USAGES = ['valueGenerator', 'strategy', 'both'] as const;
export type Usage = (typeof USAGES)[number];

export const USAGE_LABEL: Record<Usage, string> = {
  valueGenerator: 'Value generator',
  strategy: 'Strategy',
  both: 'Both',
};

/** Sentinel prefix used inside SchemaProp.faker to reference a function by id. */
export const FN_PREFIX = '$fn:';
```

- [ ] **Step 2: Create `monacoTypes.ts`**

```ts
/**
 * Ambient .d.ts string registered with Monaco's javascriptDefaults so the
 * editor offers IntelliSense for the implicit `ctx` argument without forcing
 * users to write TypeScript. The saved source is still plain JS.
 */
export const MONACO_AMBIENT_TYPES = `
// Mirage custom-function ambient types.
// These are only seen by the editor — the saved file is JavaScript.
declare const ctx: ValueGeneratorContext;

interface ValueGeneratorContext {
  faker: FakerLike;
  rng: () => number;
  salt: string;
}

interface StrategyContext {
  sourceRows: ReadonlyArray<Record<string, unknown>>;
  targetRows: ReadonlyArray<Record<string, unknown>>;
  cardinality: 'one' | { type: 'many'; min: number; max: number };
  rng: () => number;
  salt: string;
}

/** A tiny subset of faker-js types — enough for IntelliSense. */
interface FakerLike {
  person: {
    firstName(): string;
    lastName(): string;
    fullName(): string;
    jobTitle(): string;
  };
  internet: {
    email(): string;
    url(): string;
    ipv4(): string;
    userName(): string;
  };
  string: {
    uuid(): string;
    nanoid(): string;
    alphanumeric(len?: number): string;
  };
  date: {
    past(): Date;
    future(): Date;
    recent(): Date;
  };
  location: {
    city(): string;
    country(): string;
    streetAddress(): string;
  };
  helpers: {
    arrayElement<T>(items: ReadonlyArray<T>): T;
  };
  number: {
    int(opts?: { min?: number; max?: number }): number;
    float(opts?: { min?: number; max?: number }): number;
  };
}
`;
```

- [ ] **Step 3: Create `validate.ts`**

```ts
import { NAME_RE, USAGES, type CreateCustomFunctionBody } from './types.js';

export type FnValidationIssue =
  | { field: 'name'; message: string }
  | { field: 'usage'; message: string }
  | { field: 'source'; message: string };

export function validateFn(body: CreateCustomFunctionBody): FnValidationIssue[] {
  const out: FnValidationIssue[] = [];
  if (!NAME_RE.test(body.name)) {
    out.push({ field: 'name', message: 'Name must be a JavaScript-style identifier.' });
  }
  if (!USAGES.includes(body.usage)) {
    out.push({ field: 'usage', message: 'Pick a usage.' });
  }
  if (typeof body.source !== 'string' || body.source.length < 1 || body.source.length > 20000) {
    out.push({ field: 'source', message: 'Source must be 1..20000 characters.' });
  }
  return out;
}
```

- [ ] **Step 4: Create `mapServerError.ts`**

```ts
export interface ServerError {
  error?: string;
  code?: string;
  detail?: unknown;
}

export interface ServerErrorTargets {
  setNameError: (msg: string | null) => void;
  setUsageError: (msg: string | null) => void;
  setSourceError: (msg: string | null) => void;
  setGenericBanner: (msg: string | null) => void;
}

export function makeFnServerErrorHandler(t: ServerErrorTargets) {
  return (e: ServerError | unknown) => {
    const err = (e ?? {}) as ServerError;
    const code = err.code ?? 'unknown';
    const msg = err.error ?? 'Something went wrong.';
    switch (code) {
      case 'name_invalid':
      case 'name_taken':
        t.setNameError(msg);
        return;
      case 'usage_invalid':
        t.setUsageError(msg);
        return;
      case 'source_invalid':
      case 'invalid_js':
        t.setSourceError(
          err.detail && typeof err.detail === 'object' && 'error' in err.detail
            ? `${msg}: ${String((err.detail as { error: unknown }).error)}`
            : msg,
        );
        return;
      case 'usage_in_use_as_generator':
      case 'usage_in_use_as_strategy':
        t.setGenericBanner(msg);
        return;
      case 'stale_update':
        t.setGenericBanner(
          'This Function was modified elsewhere — reload to see the latest version.',
        );
        return;
      default:
        t.setGenericBanner(msg);
    }
  };
}
```

- [ ] **Step 5: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/web --skip-nx-cache
pnpm exec prettier --check apps/web/src/pages/dashboard/functions
```

Expected: green.

---

## Task 9: `useFunctionBuffer` hook

**Files:**
- Create: `apps/web/src/pages/dashboard/functions/useFunctionBuffer.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useCallback, useMemo, useState } from 'react';
import type { CustomFunction } from './lib/types.js';

export interface FunctionBuffer {
  original: CustomFunction;
  draft: CustomFunction;
  setDraft: (next: CustomFunction | ((prev: CustomFunction) => CustomFunction)) => void;
  setOriginal: (next: CustomFunction) => void;
  isDirty: boolean;
  reset: () => void;
}

export function useFunctionBuffer(initial: CustomFunction): FunctionBuffer {
  const [original, setOriginalState] = useState<CustomFunction>(initial);
  const [draft, setDraftState] = useState<CustomFunction>(() => structuredClone(initial));

  const setDraft: FunctionBuffer['setDraft'] = useCallback((next) => {
    setDraftState((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);

  const setOriginal = useCallback((next: CustomFunction) => {
    setOriginalState(next);
  }, []);

  const reset = useCallback(() => {
    setDraftState(structuredClone(original));
  }, [original]);

  const isDirty = useMemo(
    () => JSON.stringify(original) !== JSON.stringify(draft),
    [original, draft],
  );

  return { original, draft, setDraft, setOriginal, isDirty, reset };
}
```

- [ ] **Step 2: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/web --skip-nx-cache
```

Expected: green.

---

## Task 10: ListPane, EditPane, UsagePane

**Files:**
- Create: `apps/web/src/pages/dashboard/functions/ListPane.tsx`
- Create: `apps/web/src/pages/dashboard/functions/EditPane.tsx`
- Create: `apps/web/src/pages/dashboard/functions/UsagePane.tsx`

- [ ] **Step 1: Create `ListPane.tsx`**

```tsx
import { Code2 } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { CustomFunction } from './lib/types.js';
import { USAGE_LABEL } from './lib/types.js';

interface ListPaneProps {
  functions: CustomFunction[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ListPane({ functions, activeId, onSelect }: ListPaneProps) {
  return (
    <aside className="flex h-full flex-col border-r border-border bg-card">
      <div className="flex flex-none items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
          Functions
        </span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {functions.length}
        </span>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {functions.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onSelect(f.id)}
              className={cn(
                'flex w-full items-start gap-2 border-b border-border px-4 py-3 text-left hover:bg-accent/40',
                activeId === f.id && 'bg-accent/60',
              )}
            >
              <Code2 size={14} className="mt-0.5 flex-none text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12.5px] text-foreground">{f.name}</div>
                <div className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                  {USAGE_LABEL[f.usage]}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 2: Create `UsagePane.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Code2, Database, Box } from 'lucide-react';
import { extractFnRefs } from '@mirage/engine';
import { bff } from '../../../api/client.js';
import type { Api } from '@mirage/types';

type Schema = Api.components['schemas']['Schema'];
type MirageSet = Api.components['schemas']['Set'];

interface UsagePaneProps {
  wsId: string;
  functionId: string;
}

export function UsagePane({ wsId, functionId }: UsagePaneProps) {
  const navigate = useNavigate();
  const schemas = useQuery({
    queryKey: ['schemas', wsId],
    queryFn: async (): Promise<Schema[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/schemas', {
        params: { path: { wsId } },
      });
      if (error) throw error;
      return (data ?? []) as Schema[];
    },
    staleTime: 30_000,
  });
  const sets = useQuery({
    queryKey: ['sets', wsId],
    queryFn: async (): Promise<MirageSet[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/sets', {
        params: { path: { wsId } },
      });
      if (error) throw error;
      return (data ?? []) as MirageSet[];
    },
    staleTime: 30_000,
  });

  const schemaRefs = (schemas.data ?? [])
    .flatMap((s) => extractFnRefs([s]).filter((r) => r.functionId === functionId))
    .map((r) => ({
      schemaKey: r.schemaKey,
      fieldPath: r.fieldPath,
      schema: schemas.data?.find((s) => s.key === r.schemaKey),
    }));

  const setRefs = (sets.data ?? []).flatMap((s) =>
    s.strategies
      .filter(
        (ov) =>
          ov.strategy.type === 'custom' &&
          (ov.strategy as { functionId: string }).functionId === functionId,
      )
      .map((ov) => ({ setKey: s.key, set: s, edge: `${ov.schemaKey}.${ov.fieldPath}` })),
  );

  return (
    <aside className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex-none border-b border-border px-4 py-3">
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
          Used by
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {schemaRefs.length === 0 && setRefs.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Code2 size={20} className="text-muted-foreground" />
            <p className="max-w-[200px] text-[12px] text-muted-foreground">
              Not used yet — pick this in a schema&rsquo;s Value generator picker or a set&rsquo;s
              Strategies tab.
            </p>
          </div>
        )}

        {schemaRefs.length > 0 && (
          <section className="mb-3">
            <div className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Schemas ({schemaRefs.length})
            </div>
            <ul className="flex flex-col gap-1">
              {schemaRefs.map((r) => (
                <li key={`${r.schemaKey}-${r.fieldPath}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (r.schema) {
                        navigate(`/workspaces/${wsId}/schemas?active=${r.schema.id}`);
                      }
                    }}
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-[12px] hover:bg-accent/40"
                  >
                    <Database size={12} className="flex-none text-muted-foreground" />
                    <span className="font-mono">
                      <b>{r.schemaKey}</b>
                      <span className="text-muted-foreground">.</span>
                      {r.fieldPath}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {setRefs.length > 0 && (
          <section>
            <div className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sets ({setRefs.length})
            </div>
            <ul className="flex flex-col gap-1">
              {setRefs.map((r) => (
                <li key={`${r.setKey}-${r.edge}`}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/workspaces/${wsId}/sets?active=${r.set.id}`)
                    }
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-[12px] hover:bg-accent/40"
                  >
                    <Box size={12} className="flex-none text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono">{r.setKey}</div>
                      <div className="truncate font-mono text-[10.5px] text-muted-foreground">
                        {r.edge}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Create `EditPane.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Editor, { type Monaco } from '@monaco-editor/react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../../api/client.js';
import { MONACO_AMBIENT_TYPES } from './lib/monacoTypes.js';
import { makeFnServerErrorHandler, type ServerError } from './lib/mapServerError.js';
import {
  USAGE_LABEL,
  USAGES,
  type CustomFunction,
  type UpdateCustomFunctionBody,
  type Usage,
} from './lib/types.js';
import { useFunctionBuffer } from './useFunctionBuffer.js';

interface EditPaneProps {
  wsId: string;
  fn: CustomFunction;
  onDirtyChange: (dirty: boolean) => void;
  onDeleted: () => void;
}

export function EditPane({ wsId, fn, onDirtyChange, onDeleted }: EditPaneProps) {
  const queryClient = useQueryClient();
  const buffer = useFunctionBuffer(fn);
  const [genericBanner, setGenericBanner] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    onDirtyChange(buffer.isDirty);
  }, [buffer.isDirty, onDirtyChange]);

  const save = useMutation({
    mutationFn: async (): Promise<CustomFunction> => {
      const body: UpdateCustomFunctionBody = {
        name: buffer.draft.name,
        ...(buffer.draft.description ? { description: buffer.draft.description } : {}),
        usage: buffer.draft.usage,
        source: buffer.draft.source,
        expectedUpdatedAt: buffer.original.updatedAt,
      };
      const { data, error } = await bff.PUT('/workspaces/{wsId}/custom-functions/{id}', {
        params: { path: { wsId, id: fn.id } },
        body,
      });
      if (error) throw error as ServerError;
      if (!data) throw new Error('Empty response');
      return data;
    },
    onSuccess: async (next) => {
      buffer.setOriginal(next);
      buffer.setDraft(next);
      setGenericBanner(null);
      setNameError(null);
      setUsageError(null);
      setSourceError(null);
      await queryClient.invalidateQueries({ queryKey: ['custom-functions', wsId] });
      await queryClient.invalidateQueries({ queryKey: ['custom-function', wsId, fn.id] });
    },
    onError: makeFnServerErrorHandler({
      setNameError,
      setUsageError,
      setSourceError,
      setGenericBanner,
    }),
  });

  const del = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await bff.DELETE('/workspaces/{wsId}/custom-functions/{id}', {
        params: { path: { wsId, id: fn.id } },
      });
      if (error) throw error as ServerError;
    },
    onSuccess: async () => {
      onDirtyChange(false);
      await queryClient.invalidateQueries({ queryKey: ['custom-functions', wsId] });
      onDeleted();
    },
    onError: (e: ServerError) => {
      setGenericBanner(e.error ?? 'Failed to delete function.');
    },
  });

  const beforeMount = (monaco: Monaco): void => {
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      MONACO_AMBIENT_TYPES,
      'mirage-ambient.d.ts',
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-none flex-col gap-3 border-b border-border px-6 py-4">
        <div className="flex items-start gap-4">
          <label className="flex-1">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Name
            </span>
            <input
              className={cn(
                'mt-1 h-9 w-full rounded-md border bg-background px-3 font-mono text-[13px] text-foreground',
                nameError ? 'border-destructive' : 'border-input',
              )}
              value={buffer.draft.name}
              onChange={(e) => {
                buffer.setDraft((d) => ({ ...d, name: e.target.value }));
                setNameError(null);
              }}
            />
            {nameError && <span className="mt-1 text-[11.5px] text-destructive">{nameError}</span>}
          </label>
          <label className="w-72">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Usage
            </span>
            <div className="mt-1 inline-flex rounded-md border border-input bg-background p-0.5">
              {USAGES.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    buffer.setDraft((d) => ({ ...d, usage: u as Usage }));
                    setUsageError(null);
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                    buffer.draft.usage === u
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {USAGE_LABEL[u]}
                </button>
              ))}
            </div>
            {usageError && (
              <span className="mt-1 block text-[11.5px] text-destructive">{usageError}</span>
            )}
          </label>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="ml-auto self-end h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-destructive hover:bg-accent"
          >
            Delete
          </button>
        </div>
        <label>
          <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </span>
          <input
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
            value={buffer.draft.description}
            onChange={(e) =>
              buffer.setDraft((d) => ({ ...d, description: e.target.value }))
            }
            placeholder="What does this function do?"
          />
        </label>
      </header>

      {genericBanner && (
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-[12.5px] text-destructive">
          <AlertTriangle size={13} />
          <span className="flex-1">{genericBanner}</span>
          <button
            type="button"
            onClick={() => setGenericBanner(null)}
            className="text-destructive hover:opacity-70"
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {sourceError && (
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-[12.5px] text-destructive">
          <AlertTriangle size={13} />
          <span className="flex-1 font-mono">{sourceError}</span>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          beforeMount={beforeMount}
          value={buffer.draft.source}
          onChange={(v) => {
            buffer.setDraft((d) => ({ ...d, source: v ?? '' }));
            setSourceError(null);
          }}
          options={{
            minimap: { enabled: false },
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>

      {buffer.isDirty && (
        <footer className="flex flex-none items-center gap-3 border-t border-border bg-card px-6 py-3">
          <span className="text-[12.5px] text-muted-foreground">You have unsaved changes</span>
          <span className="ml-auto" />
          <button
            type="button"
            onClick={buffer.reset}
            disabled={save.isPending}
            className="h-8 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="h-8 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      )}

      {confirmingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            <h3 className="text-[15px] font-semibold text-foreground">
              Delete &quot;{fn.name}&quot;?
            </h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              If any schema or set still references this function, deletion will fail with a
              listing of what blocks it.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={del.isPending}
                className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  del.mutate();
                }}
                disabled={del.isPending}
                className="h-9 rounded-md bg-destructive px-3 text-[12.5px] font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {del.isPending ? 'Deleting…' : 'Delete function'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify (defers until FunctionsPage exists in Task 12)**

The three files import each other through the page; the standalone TS check happens after Task 12.

---

## Task 11: CreateFunctionModal

**Files:**
- Create: `apps/web/src/pages/dashboard/functions/CreateFunctionModal.tsx`

- [ ] **Step 1: Create the modal**

```tsx
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Editor, { type Monaco } from '@monaco-editor/react';
import { X } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../../api/client.js';
import { MONACO_AMBIENT_TYPES } from './lib/monacoTypes.js';
import { makeFnServerErrorHandler, type ServerError } from './lib/mapServerError.js';
import {
  NAME_RE,
  USAGE_LABEL,
  USAGES,
  type CreateCustomFunctionBody,
  type CustomFunction,
  type Usage,
} from './lib/types.js';

const STARTER_VALUE_GENERATOR = `// Return a value for one row.
// Available: ctx.faker, ctx.rng(), ctx.salt
return ctx.faker.person.firstName();`;

const STARTER_STRATEGY = `// Return one target id per source row.
// Available: ctx.sourceRows, ctx.targetRows, ctx.cardinality, ctx.rng(), ctx.salt
return ctx.sourceRows.map(() => ctx.targetRows[0].id);`;

interface Props {
  wsId: string;
  onClose: () => void;
  onCreated: (fn: CustomFunction) => void;
}

export function CreateFunctionModal({ wsId, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [usage, setUsage] = useState<Usage>('valueGenerator');
  const [source, setSource] = useState(STARTER_VALUE_GENERATOR);
  const [nameError, setNameError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [genericBanner, setGenericBanner] = useState<string | null>(null);

  // Swap the starter when the user hasn't typed yet.
  useEffect(() => {
    if (source === STARTER_VALUE_GENERATOR || source === STARTER_STRATEGY) {
      setSource(usage === 'strategy' ? STARTER_STRATEGY : STARTER_VALUE_GENERATOR);
    }
    // eslint-disable-line — intentional: only react to usage changes
  }, [usage]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const create = useMutation({
    mutationFn: async (body: CreateCustomFunctionBody): Promise<CustomFunction> => {
      const { data, error } = await bff.POST('/workspaces/{wsId}/custom-functions', {
        params: { path: { wsId } },
        body,
      });
      if (error) throw error as ServerError;
      if (!data) throw new Error('Empty response');
      return data;
    },
    onSuccess: async (fn) => {
      await queryClient.invalidateQueries({ queryKey: ['custom-functions', wsId] });
      onCreated(fn);
    },
    onError: makeFnServerErrorHandler({
      setNameError,
      setUsageError,
      setSourceError,
      setGenericBanner,
    }),
  });

  const beforeMount = (monaco: Monaco): void => {
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      MONACO_AMBIENT_TYPES,
      'mirage-ambient.d.ts',
    );
  };

  const canSubmit =
    NAME_RE.test(name) && source.length > 0 && source.length <= 20000 && !create.isPending;

  const submit = (): void => {
    const body: CreateCustomFunctionBody = {
      name,
      ...(description.trim() ? { description: description.trim() } : {}),
      usage,
      source,
    };
    create.mutate(body);
  };

  return (
    <div className="fixed inset-0 z-30 flex">
      <button
        type="button"
        aria-label="Close"
        className="flex-1 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="flex h-full w-full max-w-[860px] flex-col border-l border-border bg-card shadow-2xl md:w-[860px]">
        <header className="flex flex-none items-start gap-3 border-b border-border px-5 py-4">
          <div className="flex-1">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">
              New custom function
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              JavaScript saved as a function expression. Sandbox executes it later.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-none flex-col gap-3 border-b border-border px-5 py-4">
          <div className="grid grid-cols-[1fr_320px] gap-4">
            <label>
              <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
                Name
              </span>
              <input
                className={cn(
                  'mt-1 h-9 w-full rounded-md border bg-background px-3 font-mono text-[13px] text-foreground',
                  nameError ? 'border-destructive' : 'border-input',
                )}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
                placeholder="randomEmail"
              />
              {nameError && (
                <span className="mt-1 block text-[11.5px] text-destructive">{nameError}</span>
              )}
            </label>
            <label>
              <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
                Usage
              </span>
              <div className="mt-1 inline-flex rounded-md border border-input bg-background p-0.5">
                {USAGES.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => {
                      setUsage(u as Usage);
                      setUsageError(null);
                    }}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                      usage === u
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {USAGE_LABEL[u]}
                  </button>
                ))}
              </div>
              {usageError && (
                <span className="mt-1 block text-[11.5px] text-destructive">{usageError}</span>
              )}
            </label>
          </div>
          <label>
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Description
            </span>
            <input
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this function do?"
            />
          </label>
        </div>

        {sourceError && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-[12.5px] text-destructive">
            <span className="flex-1 font-mono">{sourceError}</span>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <Editor
            height="100%"
            defaultLanguage="javascript"
            theme="vs-dark"
            beforeMount={beforeMount}
            value={source}
            onChange={(v) => {
              setSource(v ?? '');
              setSourceError(null);
            }}
            options={{
              minimap: { enabled: false },
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
            }}
          />
        </div>

        <footer className="flex flex-none items-center gap-3 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <span className="ml-auto text-[12px] text-muted-foreground">
            {source.length}/20000 chars
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={cn(
              'h-9 rounded-md bg-primary px-4 text-[12.5px] font-medium text-primary-foreground',
              !canSubmit ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90',
            )}
          >
            {create.isPending ? 'Creating…' : 'Create function'}
          </button>
        </footer>

        {genericBanner && (
          <div className="absolute bottom-16 left-5 right-5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {genericBanner}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Task 12: FunctionsPage at the router level

**Files:**
- Create: `apps/web/src/pages/dashboard/FunctionsPage.tsx`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/components/shell/nav-config.ts`

- [ ] **Step 1: Create `FunctionsPage.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { Code2, Plus } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../api/client.js';
import { ListPane } from './functions/ListPane.js';
import { EditPane } from './functions/EditPane.js';
import { UsagePane } from './functions/UsagePane.js';
import { CreateFunctionModal } from './functions/CreateFunctionModal.js';
import type { CustomFunction } from './functions/lib/types.js';

export function FunctionsPage() {
  const { wsId } = useParams<{ wsId: string }>();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [pendingNavId, setPendingNavId] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const activeId = params.get('active');

  const list = useQuery({
    enabled: Boolean(wsId),
    queryKey: ['custom-functions', wsId],
    queryFn: async (): Promise<CustomFunction[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/custom-functions', {
        params: { path: { wsId: wsId! } },
      });
      if (error) throw error;
      return (data ?? []) as CustomFunction[];
    },
    staleTime: 30_000,
  });

  const active = useQuery({
    enabled: Boolean(wsId && activeId),
    queryKey: ['custom-function', wsId, activeId],
    queryFn: async (): Promise<CustomFunction> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/custom-functions/{id}', {
        params: { path: { wsId: wsId!, id: activeId! } },
      });
      if (error) throw error;
      return data!;
    },
    staleTime: 30_000,
  });

  const fns = list.data ?? [];

  const activeFn = useMemo<CustomFunction | null>(() => {
    if (active.data) return active.data;
    return fns.find((f) => f.id === activeId) ?? null;
  }, [active.data, fns, activeId]);

  const commitSelect = (id: string | null): void => {
    const next = new URLSearchParams(params);
    if (id) next.set('active', id);
    else next.delete('active');
    setParams(next, { replace: true });
  };

  const requestSelect = (id: string | null): void => {
    if (id === activeId) return;
    if (dirtyRef.current && id) {
      setPendingNavId(id);
      return;
    }
    commitSelect(id);
  };

  useEffect(() => {
    if (!activeId && fns.length > 0) {
      commitSelect(fns[0]!.id);
    }
    if (activeId && fns.length > 0 && !fns.some((f) => f.id === activeId)) {
      commitSelect(null);
    }
  }, [activeId, fns]);

  const isEmpty = !list.isLoading && fns.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center justify-between border-b border-border px-8 py-5">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            Functions
          </h1>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">
            {fns.length}
          </span>
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus size={14} strokeWidth={2.5} />
            New function
          </button>
        )}
      </div>

      {list.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
          Loading functions…
        </div>
      ) : isEmpty ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr_320px]">
          <ListPane functions={fns} activeId={activeId} onSelect={requestSelect} />
          <div className="min-h-0">
            {activeFn ? (
              <EditPane
                key={activeFn.id}
                wsId={wsId!}
                fn={activeFn}
                onDirtyChange={(d) => {
                  dirtyRef.current = d;
                }}
                onDeleted={() => {
                  dirtyRef.current = false;
                  commitSelect(null);
                  queryClient.invalidateQueries({ queryKey: ['custom-functions', wsId] });
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                Select a function from the left
              </div>
            )}
          </div>
          {activeFn ? (
            <UsagePane wsId={wsId!} functionId={activeFn.id} />
          ) : (
            <div className="border-l border-border bg-card" />
          )}
        </div>
      )}

      {creating && (
        <CreateFunctionModal
          wsId={wsId!}
          onClose={() => setCreating(false)}
          onCreated={(f) => {
            setCreating(false);
            commitSelect(f.id);
          }}
        />
      )}

      {pendingNavId && (
        <DiscardChangesModal
          onCancel={() => setPendingNavId(null)}
          onConfirm={() => {
            const target = pendingNavId;
            setPendingNavId(null);
            dirtyRef.current = false;
            commitSelect(target);
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Code2 size={32} strokeWidth={1.5} className={cn('text-muted-foreground')} />
      </span>
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">
        Reach beyond faker
      </h2>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        Custom Functions are workspace-level JavaScript that can power a Schema property or a Set
        Strategy.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"
      >
        <Plus size={14} strokeWidth={2.5} />
        New function
      </button>
    </div>
  );
}

function DiscardChangesModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
        <h3 className="text-[15px] font-semibold text-foreground">Discard unsaved changes?</h3>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          You have unsaved changes to this function. Switching now will discard them.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-md bg-destructive px-3 text-[12.5px] font-medium text-destructive-foreground hover:opacity-90"
          >
            Discard changes
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the route**

In `apps/web/src/router.tsx`, add the import and the route inside the `AppShell` block, right after the `sets` route:

```tsx
import { FunctionsPage } from './pages/dashboard/FunctionsPage.js';
// ...
        <Route path="sets" element={<SetsPage />} />
        <Route path="functions" element={<FunctionsPage />} />
        <Route path="graph" element={<GraphPage />} />
```

- [ ] **Step 3: Add the sidebar item**

In `apps/web/src/components/shell/nav-config.ts`, change the `Workspace` section:

```ts
import {
  Code2,
  Database,
  Network,
  Play,
  History,
  Download,
  Box,
  BookOpen,
  Settings,
  type LucideIcon,
} from 'lucide-react';

// ...

  {
    section: 'Workspace',
    items: [
      { label: 'Schemas', path: 'schemas', icon: Database },
      { label: 'Sets', path: 'sets', icon: Box },
      { label: 'Functions', path: 'functions', icon: Code2 },
      { label: 'Dependency graph', path: 'graph', icon: Network },
      { label: 'Generate', path: 'generate', icon: Play },
    ],
  },
```

- [ ] **Step 4: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/web --skip-nx-cache
pnpm exec prettier --write apps/web/src/pages/dashboard/functions apps/web/src/pages/dashboard/FunctionsPage.tsx apps/web/src/router.tsx apps/web/src/components/shell/nav-config.ts
pnpm exec prettier --check apps/web
```

Expected: green.

---

## Task 13: Schema FakerCell — add Custom function group

**Files:**
- Modify: `apps/web/src/pages/dashboard/schemas/lib/types.ts`
- Modify: `apps/web/src/pages/dashboard/schemas/PropertyEditor/FakerCell.tsx`

- [ ] **Step 1: Export the `FN_PREFIX` sentinel from the schemas lib**

In `schemas/lib/types.ts`, after the existing `REF_PREFIX`:

```ts
export const FN_PREFIX = '$fn:';
```

- [ ] **Step 2: Update `FakerCell.tsx` to handle `$fn:` values and render a function picker**

Replace the contents of `FakerCell.tsx` with the version below. The change adds: (a) recognition of the `$fn:` prefix when displaying the current value; (b) a query against `/workspaces/:wsId/custom-functions?usage=valueGenerator`; (c) a third group in the dropdown labelled "Custom functions" with one row per function.

```tsx
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Code2, Link2, Search } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../../../api/client.js';
import type { Schema, SchemaProp } from '../lib/types.js';
import { FAKER_GROUPS, FN_PREFIX, REF_PREFIX } from '../lib/types.js';
import type { Api } from '@mirage/types';

type CustomFunction = Api.components['schemas']['CustomFunction'];

export interface FakerCellProps {
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  onToggle: () => void;
  workspaceSchemas: Schema[];
  invalid: boolean;
}

export function FakerCell({
  value,
  onChange,
  open,
  onToggle,
  workspaceSchemas,
  invalid,
}: FakerCellProps) {
  const { wsId } = useParams<{ wsId: string }>();
  const isRef = value.startsWith(REF_PREFIX);
  const isFn = value.startsWith(FN_PREFIX);
  const refTarget = isRef ? value.slice(REF_PREFIX.length) : '';
  const fnId = isFn ? value.slice(FN_PREFIX.length) : '';
  const dot = !isRef && !isFn && value ? value.indexOf('.') : -1;
  const ns = dot < 0 ? '' : value.slice(0, dot);
  const method = dot < 0 ? value : value.slice(dot + 1);

  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const customFunctions = useQuery({
    enabled: open && Boolean(wsId),
    queryKey: ['custom-functions', wsId, 'usage=valueGenerator'],
    queryFn: async (): Promise<CustomFunction[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/custom-functions', {
        params: { path: { wsId: wsId! }, query: { usage: 'valueGenerator' } },
      });
      if (error) throw error;
      return (data ?? []) as CustomFunction[];
    },
    staleTime: 30_000,
  });

  // Side-load the active function name when displaying a $fn: value in the closed cell.
  const activeFn = useQuery({
    enabled: isFn && Boolean(wsId && fnId),
    queryKey: ['custom-function', wsId, fnId],
    queryFn: async (): Promise<CustomFunction> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/custom-functions/{id}', {
        params: { path: { wsId: wsId!, id: fnId } },
      });
      if (error) throw error;
      return data!;
    },
    staleTime: 60_000,
  });

  const refOptions = useMemo(() => {
    const out: { key: string; field: string; type: SchemaProp['type'] }[] = [];
    const flatten = (key: string, props: SchemaProp[], path: string): void => {
      for (const p of props) {
        const nextPath = path ? `${path}.${p.name}` : p.name;
        if (p.type !== 'object' && p.type !== 'array') {
          out.push({ key, field: nextPath, type: p.type });
        }
        if (p.type === 'object' && Array.isArray(p.fields)) {
          flatten(key, p.fields, nextPath);
        }
      }
    };
    for (const s of workspaceSchemas) flatten(s.key, s.properties, '');
    return out;
  }, [workspaceSchemas]);

  const lowerFilter = filter.trim().toLowerCase();
  const filteredRefs = lowerFilter
    ? refOptions.filter(
        (r) =>
          r.key.toLowerCase().includes(lowerFilter) ||
          r.field.toLowerCase().includes(lowerFilter),
      )
    : refOptions;
  const filteredGroups = lowerFilter
    ? FAKER_GROUPS.map((g) => ({
        ...g,
        methods: g.methods.filter(
          (m) =>
            m.toLowerCase().includes(lowerFilter) ||
            g.ns.toLowerCase().includes(lowerFilter),
        ),
      })).filter((g) => g.methods.length > 0)
    : FAKER_GROUPS;
  const filteredFns = lowerFilter
    ? (customFunctions.data ?? []).filter((f) => f.name.toLowerCase().includes(lowerFilter))
    : (customFunctions.data ?? []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex h-7 w-full items-center gap-1.5 rounded-md border bg-background px-2 text-left text-[11.5px]',
          invalid ? 'border-destructive' : 'border-input',
        )}
      >
        {!value && (
          <span className="italic text-muted-foreground">— pick a method —</span>
        )}
        {value && isRef && (
          <span className="inline-flex items-center gap-1 truncate">
            <Link2 size={10} className="text-brand-violet" />
            <span className={cn('font-mono', invalid && 'text-destructive')}>{refTarget}</span>
          </span>
        )}
        {value && isFn && (
          <span className="inline-flex items-center gap-1 truncate">
            <Code2 size={10} className="text-brand-emerald" />
            <span className={cn('font-mono', invalid && 'text-destructive')}>
              {activeFn.data?.name ?? fnId}
            </span>
          </span>
        )}
        {value && !isRef && !isFn && (
          <span className="inline-flex items-center gap-0.5 truncate font-mono">
            <span className="text-muted-foreground">{ns}</span>
            <span className="text-muted-foreground">.</span>
            <span className="text-foreground">{method}</span>
          </span>
        )}
        <ChevronDown size={11} className="ml-auto flex-none text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onToggle} />
          <div className="absolute left-0 top-8 z-40 w-[320px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            <div className="border-b border-border bg-card px-2 py-2">
              <div className="relative">
                <Search
                  size={12}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  ref={inputRef}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter…"
                  autoFocus
                  className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 text-[12px] outline-none focus:border-ring"
                />
              </div>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {filteredFns.length > 0 && (
                <>
                  <div className="px-2 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Custom functions
                  </div>
                  {filteredFns.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        onChange(`${FN_PREFIX}${f.id}`);
                        onToggle();
                      }}
                      className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11.5px] hover:bg-accent"
                    >
                      <Code2 size={11} className="text-brand-emerald" />
                      <span className="font-mono">{f.name}</span>
                      <span className="ml-auto rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {f.usage}
                      </span>
                    </button>
                  ))}
                </>
              )}
              {filteredRefs.length > 0 && (
                <>
                  <div className="px-2 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    References (cross-schema)
                  </div>
                  {filteredRefs.map((r) => (
                    <button
                      key={`${r.key}.${r.field}`}
                      type="button"
                      onClick={() => {
                        onChange(`${REF_PREFIX}${r.key}.${r.field}`);
                        onToggle();
                      }}
                      className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11.5px] hover:bg-accent"
                    >
                      <Link2 size={11} className="text-brand-violet" />
                      <span className="font-mono">
                        <b>{r.key}</b>
                        <span className="text-muted-foreground">.</span>
                        {r.field}
                      </span>
                      <span className="ml-auto rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {r.type}
                      </span>
                    </button>
                  ))}
                </>
              )}
              {filteredGroups.length > 0 && (
                <>
                  <div className="px-2 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Faker methods
                  </div>
                  {filteredGroups.map((g) => (
                    <div key={g.ns}>
                      <div className="px-2 pt-1 text-[10px] font-medium text-muted-foreground">
                        {g.ns}
                      </div>
                      {g.methods.map((m) => (
                        <button
                          key={`${g.ns}.${m}`}
                          type="button"
                          onClick={() => {
                            onChange(`${g.ns}.${m}`);
                            onToggle();
                          }}
                          className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11.5px] hover:bg-accent"
                        >
                          <span className="rounded bg-brand-violet/10 px-1 py-0 font-mono text-[10px] text-brand-violet">
                            {g.ns}
                          </span>
                          <span className="font-mono">.{m}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
              {filteredRefs.length === 0 &&
                filteredGroups.length === 0 &&
                filteredFns.length === 0 && (
                  <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
                    No matches
                  </div>
                )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/web --skip-nx-cache
pnpm exec prettier --write apps/web/src/pages/dashboard/schemas/PropertyEditor/FakerCell.tsx apps/web/src/pages/dashboard/schemas/lib/types.ts
pnpm exec prettier --check apps/web
```

Expected: green.

---

## Task 14: Set StrategiesTab — re-enable Custom function

**Files:**
- Modify: `apps/web/src/pages/dashboard/sets/StrategiesTab.tsx`

The current "Custom function" tile is disabled with `opacity-60`. Replace it with an interactive tile + a function picker dropdown that appears when active.

- [ ] **Step 1: Replace the disabled tile and add the picker UI**

Open `StrategiesTab.tsx`. Locate the `<div className="flex items-start gap-2 rounded-lg border border-dashed border-input p-3 text-left opacity-60" title="Requires Custom Functions — coming soon">` block — replace it with an interactive button that selects the `custom` strategy. Show an inline dropdown when `currentStrategy.type === 'custom'`.

Apply the following changes:

1. **Imports** — add at top:

```tsx
import { useQuery } from '@tanstack/react-query';
import type { Api } from '@mirage/types';
type CustomFunction = Api.components['schemas']['CustomFunction'];
```

2. **Inside `StrategiesTab`**, after the `edgesQuery` definition, add:

```tsx
  const fnsQuery = useQuery({
    queryKey: ['custom-functions', wsId, 'usage=strategy'],
    queryFn: async (): Promise<CustomFunction[]> => {
      const { data, error: e } = await bff.GET('/workspaces/{wsId}/custom-functions', {
        params: { path: { wsId }, query: { usage: 'strategy' } },
      });
      if (e) throw e;
      return (data ?? []) as CustomFunction[];
    },
    staleTime: 30_000,
  });
  const strategyFns = fnsQuery.data ?? [];
```

3. **Replace the disabled tile** with:

```tsx
            <button
              type="button"
              onClick={() => {
                // Default to the first available strategy function if any
                const first = strategyFns[0];
                if (first) setStrategy({ type: 'custom', functionId: first.id });
                else setStrategy({ type: 'custom', functionId: '' });
              }}
              className={cn(
                'flex items-start gap-2 rounded-lg border bg-background p-3 text-left',
                currentStrategy.type === 'custom'
                  ? 'border-foreground'
                  : 'border-input hover:bg-accent/40',
                strategyFns.length === 0 && 'opacity-60',
              )}
            >
              <Sliders size={14} className="mt-0.5 flex-none" />
              <div>
                <div className="text-[12.5px] font-semibold text-foreground">Custom function</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {strategyFns.length === 0
                    ? 'No strategy functions yet — create one on the Functions page.'
                    : 'Pick one of your workspace functions.'}
                </div>
              </div>
            </button>
```

4. **Add a dropdown below the strategy grid** (after the existing `currentStrategy.type === 'random' && …` block):

```tsx
          {currentStrategy.type === 'custom' && (
            <div className="mt-2 flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
                Function
              </label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-[13px] text-foreground"
                value={
                  currentStrategy.type === 'custom'
                    ? (currentStrategy as { functionId: string }).functionId
                    : ''
                }
                onChange={(e) =>
                  setStrategy({ type: 'custom', functionId: e.target.value })
                }
              >
                {strategyFns.length === 0 ? (
                  <option value="">No strategy functions available</option>
                ) : (
                  strategyFns.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.usage})
                    </option>
                  ))
                )}
              </select>
              {strategyFns.length === 0 && (
                <span className="text-[11.5px] text-muted-foreground">
                  Create a function with usage &ldquo;Strategy&rdquo; or &ldquo;Both&rdquo; on the
                  Functions page first.
                </span>
              )}
            </div>
          )}
```

5. **Update the `currentStrategy` typing**. The existing `Strategy` union now includes the `custom` variant from Task 1's regen; the change to `setStrategy(t === 'random' ? { type: 'random' } : { type: t })` already passes through. No additional change needed.

6. **Strategy label in the edge list**. The line `STRATEGY_META[(ov?.strategy.type ?? '1:1') as keyof typeof STRATEGY_META].label` will return `undefined.label` for `type === 'custom'`. Add an entry to `STRATEGY_META`:

```tsx
const STRATEGY_META: Record<
  '1:1' | 'random' | 'evenSplit' | 'custom',
  { label: string; desc: string; icon: typeof Link2 }
> = {
  '1:1': { /* unchanged */ },
  random: { /* unchanged */ },
  evenSplit: { /* unchanged */ },
  custom: {
    label: 'Custom function',
    desc: 'Run a user-written function from this workspace.',
    icon: Sliders,
  },
};
```

- [ ] **Step 2: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/web --skip-nx-cache
pnpm exec prettier --write apps/web/src/pages/dashboard/sets/StrategiesTab.tsx
pnpm exec prettier --check apps/web
```

Expected: green.

---

## Task 15: Full repo verification

**Files:** (none modified — verification only)

- [ ] **Step 1: Full typecheck + lint across all 11 projects**

```bash
pnpm exec nx run-many -t typecheck,lint --skip-nx-cache
```

Expected: 11 projects + 1 task they depend on, all green.

- [ ] **Step 2: Confirm the SPA still builds**

```bash
pnpm exec nx run @mirage/web:build
```

Expected: build completes with no errors (chunk-size warning is pre-existing).

- [ ] **Step 3: Confirm prettier**

```bash
pnpm exec prettier --check 'apps/**' 'packages/**'
```

Expected: clean across all our files (pre-existing warnings under `design/screens_export/` are not our concern).

---

## Task 16: End-to-end manual smoke

This task is operator-driven; it verifies the integrated flow against running infra.

- [ ] **Step 1: Bring up the stack**

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm dev
```

Wait for all five apps to log "ready".

- [ ] **Step 2: Create a function**

1. In the browser, sign in and pick a workspace.
2. Sidebar → **Functions** → empty state. Click **New function**.
3. Name `randomFirstName`, usage **Value generator**, default source pre-populated. Click **Create function**.
4. The new function opens in the detail view, the editor shows the source, Used-by panel says "Not used yet".

- [ ] **Step 3: Invalid JS rejection**

1. Edit the source to `return ((;`. Click **Save changes**.
2. Expect a red banner with `invalid_js` parser message. The original source is still on disk.

- [ ] **Step 4: Wire from a Schema**

1. Navigate to **Schemas** → open a schema → add or edit a string property.
2. Click the Value Generator picker. Confirm a **Custom functions** group is at the top. Pick `randomFirstName`.
3. Save the schema. The faker cell now shows the function name with a code icon.
4. Back on **Functions** → open `randomFirstName` → **Used by** panel shows the schema.

- [ ] **Step 5: Try to delete a referenced function**

1. On the function detail, click **Delete** → confirm.
2. Expect a 400 surfaced in the banner: "Function is referenced by schemas: …".

- [ ] **Step 6: Usage-narrowing**

1. Edit the function and switch usage to **Strategy**. Save.
2. Expect `usage_in_use_as_generator`: "Function is still used as a Value Generator by: …".

- [ ] **Step 7: Use as a Strategy**

1. Create a second function `pickFirst`, usage **Strategy**, default source.
2. Navigate to **Sets** → open a set with at least one cross-schema edge → **Strategies** tab.
3. Click the **Custom function** tile. The dropdown lists `pickFirst`. Pick it, save the set.
4. Open `pickFirst` → **Used by** panel shows the set.

- [ ] **Step 8: Delete the unreferenced function**

1. Remove the reference from the schema in step 4. Save schema.
2. Delete `randomFirstName`. Expect 204; the list refreshes without it.

Document any deviations or failures.

---

## Self-review notes

- **Spec coverage:**
  - OpenAPI types + Strategy `custom` variant → Task 1.
  - Engine `extractFnRefs` → Task 2.
  - Mongo collection + indexes → Task 3.
  - CRUD routes + JS validity + usage narrowing + delete checks → Task 4.
  - Schema save validates `$fn:` refs → Task 5.
  - Set save validates `custom` Strategy `functionId` → Task 6.
  - BFF proxy → Task 7.
  - SPA shared lib (types, monacoTypes, validate, mapServerError) → Task 8.
  - useFunctionBuffer → Task 9.
  - ListPane + EditPane + UsagePane → Task 10.
  - CreateFunctionModal → Task 11.
  - FunctionsPage + router + sidebar → Task 12.
  - Schema FakerCell integration → Task 13.
  - Set StrategiesTab integration → Task 14.
  - Full verification → Task 15.
  - End-to-end smoke → Task 16.
- **No placeholders.** Every step contains the exact code or command needed.
- **Naming consistency:** `CustomFunction` / `CustomFunctionDoc` / `$fn:` / `FN_PREFIX` / `extractFnRefs` used identically across server, engine, and SPA. Error codes match between server and `mapServerError`: `name_invalid`, `name_taken`, `usage_invalid`, `source_invalid`, `invalid_js`, `usage_in_use_as_generator`, `usage_in_use_as_strategy`, `ref_in_use_by_schema`, `ref_in_use_by_set`, `fn_target_missing`, `fn_usage_mismatch`, `stale_update`.
- **No commits scheduled.** Per project memory, the user commits work themselves. Tasks end at verification.
