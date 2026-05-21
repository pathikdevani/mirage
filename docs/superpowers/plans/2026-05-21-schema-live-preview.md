# Schema editor — live preview & inline property editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder right-side `PreviewPane` in the schema editor with a tabbed panel that (1) shows a live, debounced preview of generated rows (1–10) for the schema being edited plus its referenced schemas, and (2) shows the property edit form inline when a property is selected, eliminating the `PropDetailDrawer` popup.

**Architecture:** A new server-side dry-run endpoint generates rows for an in-memory schema draft using the existing `@mirage/engine` + `@mirage/sandbox`, plus rows for any referenced schemas. The frontend right panel becomes a stateful tabbed component (`SchemaSidePanel`) that consumes a lifted `useSchemaBuffer` and `selectedPath` state owned by `SchemasPage`. The existing `PreviewPane` and `PropDetailDrawer` files are deleted.

**Tech Stack:** TypeScript, Fastify, React, TanStack Query, MongoDB, `@faker-js/faker`, `@mirage/engine`, `@mirage/sandbox`, OpenAPI (codegen via `openapi-typescript`), Vitest.

**Spec:** [docs/superpowers/specs/2026-05-21-schema-live-preview-design.md](../specs/2026-05-21-schema-live-preview-design.md)

---

## Task 1: Add `dry-run` endpoint to OpenAPI spec & regenerate types

**Files:**
- Modify: `packages/types/openapi.yaml` (insert new path + response component after the existing `/workspaces/{wsId}/schemas/{id}` block around line 215)
- Generated: `packages/types/src/openapi.generated.ts` (do not hand-edit — produced by `pnpm --filter @mirage/types run gen`)

- [ ] **Step 1: Add the path and response schema to `openapi.yaml`**

Open `packages/types/openapi.yaml`. After the existing `/workspaces/{wsId}/schemas/{id}` block (ending around line 215), and before `/workspaces/{wsId}/sets:`, insert:

```yaml
  /workspaces/{wsId}/schemas/dry-run:
    parameters:
      - in: path
        name: wsId
        required: true
        schema: { type: string }
      - in: query
        name: count
        required: false
        schema: { type: integer, minimum: 1, maximum: 10, default: 1 }
    post:
      summary: Generate sample rows for an in-memory schema draft without persisting
      operationId: dryRunSchema
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DryRunSchemaBody'
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DryRunSchemaResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
        '422':
          $ref: '#/components/responses/BadRequest'
```

Then locate the `components: schemas:` block (search for `CreateSchemaBody:` around line 656). Immediately **after** the `UpdateSchemaBody` definition (line 701, ending at `expectedUpdatedAt: { type: string, format: date-time }`), insert:

```yaml
    DryRunSchemaBody:
      type: object
      required: [schema]
      additionalProperties: false
      properties:
        schema:
          $ref: '#/components/schemas/CreateSchemaBody'
        salt:
          type: string
          minLength: 1
          maxLength: 128

    DryRunSchemaResponse:
      type: object
      required: [rows, refs]
      additionalProperties: false
      properties:
        rows:
          type: array
          items:
            type: object
            additionalProperties: true
        refs:
          type: object
          additionalProperties:
            type: array
            items:
              type: object
              additionalProperties: true
```

- [ ] **Step 2: Regenerate the typed client**

Run from repo root:

```bash
pnpm --filter @mirage/types run gen
```

Expected: `packages/types/src/openapi.generated.ts` is rewritten with no errors. New types `paths['/workspaces/{wsId}/schemas/dry-run']` and `components['schemas']['DryRunSchemaBody']` / `DryRunSchemaResponse` are present.

- [ ] **Step 3: Verify typecheck still passes**

```bash
pnpm --filter @mirage/types run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/types/openapi.yaml packages/types/src/openapi.generated.ts
git commit -m "feat(types): add dry-run schema endpoint to OpenAPI"
```

---

## Task 2: Create `dry-run.ts` in engine package + unit test

**Files:**
- Create: `packages/engine/src/dry-run.ts`
- Create: `packages/engine/src/__tests__/dry-run.test.ts`
- Modify: `packages/engine/src/index.ts` (add re-export)

The helper takes the draft schema + a map of referenced schemas (by key) + sandbox + custom-fn registry. It generates `count` rows for the draft, collects unique referenced schema keys, generates `count` rows for each (independently seeded so refs are reproducible), then walks each draft row and replaces any `RefPlaceholder` with the corresponding generated ref row (matched by position: row[i] → ref[i] for i < count).

- [ ] **Step 1: Write failing test**

Create `packages/engine/src/__tests__/dry-run.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import { dryRunSchema } from '../dry-run.js';
import { customFunctionRegistryFromMap } from '../custom-function-registry.js';

type Schema = Api.components['schemas']['Schema'];

const schema = (key: string, props: Api.components['schemas']['SchemaProp'][]): Schema =>
  ({
    id: `sch_${key}`,
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key,
    name: key,
    description: '',
    color: 'violet',
    icon: 'database',
    tags: [],
    properties: props,
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as Schema;

const fakeSandbox = { invoke: async () => null } as unknown as SandboxPool;

describe('dryRunSchema', () => {
  it('generates the requested number of rows for the main schema', async () => {
    const draft = schema('user', [
      { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      { name: 'name', type: 'string', faker: 'person.firstName', required: false },
    ]);
    const result = await dryRunSchema({
      draft,
      referencedSchemas: new Map(),
      count: 3,
      salt: 'preview',
      locale: 'en',
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
    });
    expect(result.rows).toHaveLength(3);
    expect(result.refs).toEqual({});
    expect(typeof (result.rows[0] as Record<string, unknown>)['id']).toBe('string');
  });

  it('generates ref rows and substitutes them into the main rows', async () => {
    const orgSchema = schema('org', [
      { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      { name: 'name', type: 'string', faker: 'company.name', required: false },
    ]);
    const draft = schema('user', [
      { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      { name: 'orgId', type: 'string', faker: '$ref:org.id', required: false },
    ]);
    const result = await dryRunSchema({
      draft,
      referencedSchemas: new Map([['org', orgSchema]]),
      count: 2,
      salt: 'preview',
      locale: 'en',
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
    });
    expect(result.rows).toHaveLength(2);
    expect(result.refs['org']).toHaveLength(2);
    // The orgId field should be a primitive substituted from the ref row's id.
    const orgIds = (result.refs['org'] as Array<Record<string, unknown>>).map((r) => r['id']);
    const userOrgIds = (result.rows as Array<Record<string, unknown>>).map((r) => r['orgId']);
    expect(userOrgIds).toEqual(orgIds);
  });

  it('leaves fields as null when ref target is missing from referencedSchemas', async () => {
    const draft = schema('user', [
      { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      { name: 'orgId', type: 'string', faker: '$ref:org.id', required: false },
    ]);
    const result = await dryRunSchema({
      draft,
      referencedSchemas: new Map(),
      count: 1,
      salt: 'preview',
      locale: 'en',
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.refs).toEqual({});
    expect((result.rows[0] as Record<string, unknown>)['orgId']).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @mirage/engine exec vitest run src/__tests__/dry-run.test.ts
```

Expected: FAIL — `Cannot find module '../dry-run.js'`.

- [ ] **Step 3: Implement `dry-run.ts`**

Create `packages/engine/src/dry-run.ts`:

```ts
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { generateRows } from './generate-rows.js';
import { isRefPlaceholder, type ResolvedRow } from './resolve-schema.js';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;

export interface DryRunSchemaParams {
  draft: Schema;
  referencedSchemas: Map<string, Schema>;
  count: number;
  salt: string;
  locale: string;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

export interface DryRunSchemaResult {
  rows: Record<string, unknown>[];
  refs: Record<string, Record<string, unknown>[]>;
}

/**
 * Collect all distinct `$ref:<targetKey>` keys referenced anywhere in the
 * property tree (object fields, array items, nested).
 */
function collectRefKeys(properties: SchemaProp[]): Set<string> {
  const out = new Set<string>();
  const walk = (props: SchemaProp[]): void => {
    for (const p of props) {
      if (typeof p.faker === 'string') {
        const m = p.faker.match(REF_RE);
        if (m) out.add(m[1]!);
      }
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields);
      else if (p.type === 'array' && p.items) walk([p.items]);
    }
  };
  walk(properties);
  return out;
}

async function drainGenerate(
  schema: Schema,
  count: number,
  salt: string,
  locale: string,
  customFunctions: CustomFunctionRegistry,
  sandbox: SandboxPool,
): Promise<ResolvedRow[]> {
  const out: ResolvedRow[] = [];
  for await (const row of generateRows({ schema, count, salt, locale, customFunctions, sandbox })) {
    out.push(row);
  }
  return out;
}

/**
 * Walks the draft schema in parallel with `row`, replacing each `$ref:key.field`
 * placeholder with the matching value from `refRow.field` (or `null` if the ref
 * target or field is missing). Plain `$ref:key` substitutes the whole ref row.
 */
function substituteRefsForRow(
  draftProps: SchemaProp[],
  row: Record<string, unknown>,
  refRowsByKey: Map<string, Record<string, unknown>>,
): void {
  const walkProps = (props: SchemaProp[], node: Record<string, unknown>): void => {
    for (const p of props) {
      const value = node[p.name];
      if (typeof p.faker === 'string') {
        const m = p.faker.match(REF_RE);
        if (m && isRefPlaceholder(value)) {
          const targetKey = m[1]!;
          const targetField = m[2];
          const refRow = refRowsByKey.get(targetKey);
          if (!refRow) {
            node[p.name] = null;
          } else if (targetField) {
            node[p.name] = pickPath(refRow, targetField);
          } else {
            node[p.name] = refRow;
          }
          continue;
        }
      }
      if (p.type === 'object' && Array.isArray(p.fields) && value && typeof value === 'object') {
        walkProps(p.fields, value as Record<string, unknown>);
      } else if (p.type === 'array' && p.items && Array.isArray(value)) {
        for (const item of value) {
          if (p.items.type === 'object' && Array.isArray(p.items.fields) && item && typeof item === 'object') {
            walkProps(p.items.fields, item as Record<string, unknown>);
          }
        }
      }
    }
  };
  walkProps(draftProps, row);
}

function pickPath(row: Record<string, unknown>, path: string): unknown {
  let cur: unknown = row;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur === undefined ? null : cur;
}

export async function dryRunSchema(params: DryRunSchemaParams): Promise<DryRunSchemaResult> {
  const { draft, referencedSchemas, count, salt, locale, customFunctions, sandbox } = params;

  const mainRows = await drainGenerate(draft, count, salt, locale, customFunctions, sandbox);

  const refKeys = collectRefKeys(draft.properties);
  const refs: Record<string, Record<string, unknown>[]> = {};
  const refRowsByKeyByIndex: Map<string, Record<string, unknown>[]> = new Map();

  for (const key of refKeys) {
    const refSchema = referencedSchemas.get(key);
    if (!refSchema) continue;
    const refRows = await drainGenerate(refSchema, count, salt, locale, customFunctions, sandbox);
    const plain = refRows.map((r) => stripMeta(r));
    refs[key] = plain;
    refRowsByKeyByIndex.set(key, plain);
  }

  // Substitute refs row-by-row, picking the i-th ref row for the i-th main row.
  for (let i = 0; i < mainRows.length; i++) {
    const refRowsByKey = new Map<string, Record<string, unknown>>();
    for (const [key, arr] of refRowsByKeyByIndex) {
      const refRow = arr[i];
      if (refRow) refRowsByKey.set(key, refRow);
    }
    substituteRefsForRow(draft.properties, mainRows[i] as unknown as Record<string, unknown>, refRowsByKey);
  }

  return {
    rows: mainRows.map((r) => stripMeta(r)),
    refs,
  };
}

function stripMeta(row: ResolvedRow): Record<string, unknown> {
  const { __schemaKey, __id, ...rest } = row as Record<string, unknown> & {
    __schemaKey: unknown;
    __id: unknown;
  };
  // Reference both to keep TypeScript happy without an unused-var warning.
  void __schemaKey;
  void __id;
  return rest;
}
```

- [ ] **Step 4: Re-export from `packages/engine/src/index.ts`**

Open `packages/engine/src/index.ts` and add after line 22 (after the `run-set-stream` export):

```ts
export * from './dry-run.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @mirage/engine exec vitest run src/__tests__/dry-run.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Run full engine test suite to verify no regressions**

```bash
pnpm --filter @mirage/engine exec vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/dry-run.ts packages/engine/src/__tests__/dry-run.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): add dryRunSchema helper for in-memory preview"
```

---

## Task 3: Add `@mirage/sandbox` dep + sandbox singleton to workspace-svc

The dry-run route runs inside workspace-svc and reuses the existing engine. `@mirage/engine` is already a workspace-svc dep, but `@mirage/sandbox` is not. We need a process-local pool.

**Files:**
- Modify: `apps/workspace-svc/package.json`
- Create: `apps/workspace-svc/src/sandbox-singleton.ts`

- [ ] **Step 1: Add the dep to `apps/workspace-svc/package.json`**

In the `dependencies` block (around line 7), add the line for `@mirage/sandbox` so the block reads (alphabetical order preserved):

```json
  "dependencies": {
    "@aws-sdk/client-s3": "^3.717.0",
    "@mirage/auth": "workspace:*",
    "@mirage/engine": "workspace:*",
    "@mirage/sandbox": "workspace:*",
    "@mirage/types": "workspace:*",
    "bullmq": "^5.34.5",
    "fastify": "^5.2.1",
    "ioredis": "^5.4.2",
    "mongodb": "^6.12.0",
    "nanoid": "^5.0.9"
  },
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: no errors; lockfile updated.

- [ ] **Step 3: Create the sandbox singleton**

Create `apps/workspace-svc/src/sandbox-singleton.ts`:

```ts
import { createSandboxPool, type SandboxPool } from '@mirage/sandbox';

let pool: SandboxPool | null = null;

export function getSandbox(): SandboxPool {
  if (pool) return pool;
  pool = createSandboxPool({
    size: 1,
    perCallTimeoutMs: 2000,
    memoryCapMb: 64,
  });
  return pool;
}
```

Note: pool size 1, 2 s timeout, 64 MB memory cap are conservative defaults appropriate for synchronous preview requests; the generation-worker uses larger values for batch jobs.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @mirage/workspace-svc run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/workspace-svc/package.json apps/workspace-svc/src/sandbox-singleton.ts pnpm-lock.yaml
git commit -m "feat(workspace-svc): add sandbox singleton for synchronous preview"
```

---

## Task 4: Add `POST /workspaces/:wsId/schemas/dry-run` route to workspace-svc

**Files:**
- Modify: `apps/workspace-svc/src/routes/schemas.ts`

The handler:
1. Resolves the workspace (re-uses `resolveWorkspace`).
2. Normalises & validates the body via the existing `normalizeAndValidateBody`. On validation failure, returns 422 (not 400) so the frontend can distinguish "draft is invalid" from "request malformed".
3. Loads all schemas in the workspace from MongoDB; builds the `referencedSchemas` map (filter to only the keys actually referenced by the draft).
4. Loads the custom-functions registry for the workspace (same pattern as create/update).
5. Calls `dryRunSchema` from `@mirage/engine`.
6. Returns `{ rows, refs }`.

- [ ] **Step 1: Add imports at top of `apps/workspace-svc/src/routes/schemas.ts`**

After the existing imports (after line 5 `import type { MirageDb, SchemaDoc } from '../db.js';`), add:

```ts
import { dryRunSchema, customFunctionRegistryFromMap } from '@mirage/engine';
import { getSandbox } from '../sandbox-singleton.js';
```

Also add this type alias near the other `type` aliases at the top (after line 10):

```ts
type DryRunSchemaBody = Api.components['schemas']['DryRunSchemaBody'];
type DryRunSchemaResponse = Api.components['schemas']['DryRunSchemaResponse'];
```

- [ ] **Step 2: Register the new route inside `registerSchemaRoutes`**

Inside `registerSchemaRoutes(app, db)` (currently the function starting at line 260), add the route **before** the `app.delete` block (so it lives near the `app.put` block ending around line 681). Insert:

```ts
  app.post<{
    Params: ListParams;
    Querystring: { count?: string };
    Body: DryRunSchemaBody;
  }>('/workspaces/:wsId/schemas/dry-run', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;

    const rawCount = request.query?.count;
    let count = 1;
    if (typeof rawCount === 'string' && rawCount.length > 0) {
      const parsed = Number.parseInt(rawCount, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return reply.code(400).send(err('count_invalid', '`count` must be an integer >= 1'));
      }
      count = Math.min(parsed, 10);
    }

    const body = request.body;
    if (!body || typeof body !== 'object' || !body.schema) {
      return reply.code(400).send(err('body_invalid', '`schema` is required'));
    }

    const normalized = normalizeAndValidateBody(body.schema);
    if ('code' in normalized) {
      return reply
        .code(422)
        .send({ error: normalized.message, code: normalized.code, detail: normalized.detail });
    }

    // Load workspace schemas and filter to the ones the draft actually references.
    const allInWs = await db.schemas
      .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
      .toArray();
    const byKey = new Map(allInWs.map((s) => [s.key, s]));
    const refs = collectRefs(normalized.properties);
    const referencedSchemas = new Map<string, SchemaDoc>();
    for (const r of refs) {
      const target = byKey.get(r.targetKey);
      if (target) referencedSchemas.set(r.targetKey, target);
    }

    // Build a CustomFunctionRegistry for the workspace (only what's needed).
    const fnDocs = await db.customFunctions
      .find({ workspaceId: request.params.wsId }, { projection: { _id: 0 } })
      .toArray();
    const fnMap = new Map(
      fnDocs.map((f) => [f.id, { source: f.source, usage: f.usage }]),
    );

    const salt = typeof body.salt === 'string' && body.salt.length > 0 ? body.salt : 'preview';

    try {
      const result = await dryRunSchema({
        draft: {
          ...normalized,
          // Fill the minimal Schema fields generateRows requires (id/orgId/etc).
          id: 'sch_preview',
          orgId: ctx.workspace.orgId as string,
          workspaceId: request.params.wsId,
          createdBy: ctx.auth.userId as string,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        } as Schema,
        referencedSchemas: referencedSchemas as Map<string, Schema>,
        count,
        salt,
        locale: 'en',
        customFunctions: customFunctionRegistryFromMap(fnMap),
        sandbox: getSandbox(),
      });
      const response: DryRunSchemaResponse = result;
      return reply.send(response);
    } catch (e) {
      request.log.error({ err: e }, 'dry-run failed');
      const message = e instanceof Error ? e.message : 'dry-run failed';
      return reply.code(500).send(err('dry_run_failed', message));
    }
  });
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @mirage/workspace-svc run typecheck
```

Expected: exit 0. If TypeScript complains about `customFunctionRegistryFromMap` map shape, check the existing import in `packages/engine/src/custom-function-registry.ts` for the exact entry shape and adjust the map values accordingly.

- [ ] **Step 4: Lint**

```bash
pnpm --filter @mirage/workspace-svc run lint
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/workspace-svc/src/routes/schemas.ts
git commit -m "feat(workspace-svc): add POST /schemas/dry-run endpoint"
```

---

## Task 5: Add BFF proxy for the new endpoint

**Files:**
- Modify: `apps/bff/src/routes/schemas.ts`

- [ ] **Step 1: Register the proxy route**

Inside `registerSchemaProxyRoutes(app)` in `apps/bff/src/routes/schemas.ts`, **before** the existing `app.get<{ Params: { wsId: string; id: string } }>('/workspaces/:wsId/schemas/:id', ...)` (currently at line 59) so the path `/dry-run` is matched before the `/:id` wildcard, add:

```ts
  app.post<{ Params: { wsId: string }; Querystring: { count?: string } }>(
    '/workspaces/:wsId/schemas/dry-run',
    (req, reply) => {
      const c = req.query?.count;
      const qs = typeof c === 'string' && c.length > 0 ? `?count=${encodeURIComponent(c)}` : '';
      return forward(
        req,
        reply,
        `/workspaces/${encodeURIComponent(req.params.wsId)}/schemas/dry-run${qs}`,
      );
    },
  );
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/bff run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Lint**

```bash
pnpm --filter @mirage/bff run lint
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/bff/src/routes/schemas.ts
git commit -m "feat(bff): proxy /schemas/dry-run to workspace-svc"
```

---

## Task 6: Lift `useSchemaBuffer` and `selectedPath` from `EditPane` to `SchemasPage`

`SchemaSidePanel` needs read+write access to the schema buffer (for the Edit tab) and read access to the draft (for the Preview tab's dry-run query). Both `EditPane` and `SchemaSidePanel` need to share `selectedPath`. The cleanest fix is to hoist both pieces of state to the common parent (`SchemasPage`) and turn `EditPane` into a controlled component.

**Files:**
- Modify: `apps/web/src/pages/dashboard/SchemasPage.tsx`
- Modify: `apps/web/src/pages/dashboard/schemas/EditPane/EditPane.tsx`

- [ ] **Step 1: Change `EditPane` to accept `buffer`, `selectedPath`, `onSelectPath` as props**

Open `apps/web/src/pages/dashboard/schemas/EditPane/EditPane.tsx`. Modify the `EditPaneProps` interface and the function signature.

Replace lines 18–34 with:

```ts
import type { SchemaBuffer } from './useSchemaBuffer.js';

export interface EditPaneProps {
  schema: Schema;
  buffer: SchemaBuffer;
  workspaceSchemas: Schema[];
  wsId: string;
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDeleted?: () => void;
  onSelectReferrer?: (key: string) => void;
}

export function EditPane({
  schema,
  buffer,
  workspaceSchemas,
  wsId,
  selectedPath,
  onSelectPath,
  onDirtyChange,
  onDeleted,
  onSelectReferrer,
}: EditPaneProps) {
  const queryClient = useQueryClient();
```

Then **remove** the now-redundant lines `const buffer = useSchemaBuffer(schema);` and `const [selectedPath, setSelectedPath] = useState<string | null>(null);` (currently lines 36–37).

Remove the `useSchemaBuffer` import (line 16) from this file:

```ts
import { useSchemaBuffer } from './useSchemaBuffer.js';
```

Add it back as a type-only import for `SchemaBuffer` (already handled by the new import added above; double-check it exports the type — it does via `export interface SchemaBuffer`).

Remove the `useState` from the import on line 1 if no longer used after subsequent edits — but keep `useEffect` and `useMemo`. Inspect remaining usages after this step; `useState` is still used for several local error states, so leave it in.

- [ ] **Step 2: Replace all `setSelectedPath` calls with `onSelectPath`**

In the same file, search for `setSelectedPath(` and replace each call with `onSelectPath(`. Specifically (line numbers approximate, post-edit):

- The `useEffect` that clears the selection when the target disappears: `setSelectedPath(null)` → `onSelectPath(null)`.
- `handleDrawerChange` rename block: `setSelectedPath(...)` → `onSelectPath(...)`.
- `handleDrawerDuplicate`: `setSelectedPath(newPath)` → `onSelectPath(newPath)`.
- `handleDrawerRemove`: `setSelectedPath(null)` → `onSelectPath(null)`.
- `<PropertyEditor ... onSelectPath={setSelectedPath} />` → `onSelectPath={onSelectPath}`.
- `<PropDetailDrawer ... onClose={() => setSelectedPath(null)} />` → `onClose={() => onSelectPath(null)}` (this whole component is deleted in Task 12, but keep the signature change consistent now).
- In `SaveBar`'s `onDiscard`: `setSelectedPath(null)` → `onSelectPath(null)`.

- [ ] **Step 3: Update `SchemasPage.tsx` to own buffer + selection**

Open `apps/web/src/pages/dashboard/SchemasPage.tsx`. After the existing imports add:

```ts
import { useSchemaBuffer } from './schemas/EditPane/useSchemaBuffer.js';
```

Inside the `SchemasPage` function, locate the `dirtyRef` block (line 21). After `const dirtyRef = useRef(false);`, add:

```ts
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
```

After `activeSchema` is computed (line 76), add:

```ts
  const buffer = useSchemaBuffer(activeSchema ?? ({ ...EMPTY_SCHEMA } as Schema));
```

Then add a constant `EMPTY_SCHEMA` outside the component (just below the imports):

```ts
const EMPTY_SCHEMA = {
  id: '',
  orgId: '',
  workspaceId: '',
  key: '',
  name: '',
  description: '',
  color: 'violet',
  icon: 'database',
  tags: [],
  properties: [],
  createdBy: '',
  createdAt: '1970-01-01T00:00:00Z',
  updatedAt: '1970-01-01T00:00:00Z',
} as const satisfies Schema;
```

(Justification: `useSchemaBuffer` is unconditional — React hooks rule. When there's no active schema the buffer is throwaway and not rendered.)

Then in the JSX, change the `<EditPane>` invocation to pass the new props:

```tsx
              <EditPane
                key={activeSchema.id}
                schema={activeSchema}
                buffer={buffer}
                workspaceSchemas={schemas}
                wsId={wsId!}
                selectedPath={selectedPath}
                onSelectPath={setSelectedPath}
                onDirtyChange={(dirty) => {
                  dirtyRef.current = dirty;
                }}
                onDeleted={() => {
                  dirtyRef.current = false;
                  commitSelect(null);
                  setSelectedPath(null);
                  queryClient.invalidateQueries({ queryKey: ['schemas', wsId] });
                }}
                onSelectReferrer={selectByKey}
              />
```

Note: `useSchemaBuffer` re-keys via `key={activeSchema.id}` on `<EditPane>` today (which is why state resets when switching schemas). Now that `useSchemaBuffer` is in the parent, the parent's buffer needs to reset when `activeSchema.id` changes. Add this effect just after `const buffer = useSchemaBuffer(...)`:

```ts
  useEffect(() => {
    if (activeSchema) {
      buffer.setOriginal(activeSchema);
      buffer.setDraft(structuredClone(activeSchema));
    }
    setSelectedPath(null);
  }, [activeSchema?.id]); // intentionally only id-keyed
```

Wrap the dependency-eslint disable inline if your config complains:

```ts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSchema?.id]);
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @mirage/web run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Lint**

```bash
pnpm --filter @mirage/web run lint
```

Expected: exit 0.

- [ ] **Step 6: Smoke test in the browser**

```bash
pnpm --filter @mirage/web run dev
```

Open the schemas page. Verify:
- You can switch between schemas and the editor still shows the right one.
- The Save bar still appears when you edit a property name.
- The existing PropDetailDrawer still opens when you click a property (it'll be deleted in Task 12).
- Discard-changes prompt still works when switching with unsaved edits.

Stop the dev server (Ctrl+C) when done.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/dashboard/SchemasPage.tsx apps/web/src/pages/dashboard/schemas/EditPane/EditPane.tsx
git commit -m "refactor(web): lift schema buffer + selection state to SchemasPage"
```

---

## Task 7: Create `useDebouncedValue` and `useSchemaDryRun` hooks

**Files:**
- Create: `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/useDebouncedValue.ts`
- Create: `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/useSchemaDryRun.ts`

- [ ] **Step 1: Create `useDebouncedValue.ts`**

```ts
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
```

- [ ] **Step 2: Create `useSchemaDryRun.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { Schema } from '../lib/types.js';
import { bff } from '../../../../api/client.js';
import { useDebouncedValue } from './useDebouncedValue.js';

export interface DryRunPayload {
  rows: Record<string, unknown>[];
  refs: Record<string, Record<string, unknown>[]>;
}

export interface DryRunState {
  data: DryRunPayload | null;
  isFetching: boolean;
  error: string | null;
}

/**
 * The body we send to the dry-run endpoint is everything `CreateSchemaBody`
 * needs (no id, no timestamps, no orgId).
 */
function toCreateBody(draft: Schema) {
  return {
    key: draft.key,
    name: draft.name,
    ...(draft.description ? { description: draft.description } : {}),
    color: draft.color,
    icon: draft.icon,
    tags: draft.tags,
    properties: draft.properties,
  };
}

function hashDraft(draft: Schema): string {
  // Stable JSON of the only fields that influence generation.
  return JSON.stringify(toCreateBody(draft));
}

export function useSchemaDryRun(
  wsId: string,
  draft: Schema,
  count: number,
  enabled: boolean,
): DryRunState {
  const debouncedHash = useDebouncedValue(hashDraft(draft), 400);
  const debouncedCount = useDebouncedValue(count, 400);

  const query = useQuery({
    enabled: enabled && Boolean(wsId) && draft.properties.length > 0,
    queryKey: ['schema-dry-run', wsId, debouncedCount, debouncedHash],
    queryFn: async (): Promise<DryRunPayload> => {
      const { data, error, response } = await bff.POST(
        '/workspaces/{wsId}/schemas/dry-run',
        {
          params: { path: { wsId }, query: { count: debouncedCount } },
          body: { schema: toCreateBody(draft) },
        },
      );
      if (error) {
        // 422 = draft invalid; surface message via thrown Error.
        const msg =
          (error as { error?: string; message?: string }).error ??
          (error as { message?: string }).message ??
          `Dry-run failed (${response.status})`;
        throw new Error(msg);
      }
      return (data ?? { rows: [], refs: {} }) as DryRunPayload;
    },
    staleTime: 0,
    retry: false,
  });

  return {
    data: query.data ?? null,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
```

Note: `bff.POST` accepts a `query` shape because the OpenAPI path has a `query` parameter; if the codegen types `count` as `number`, pass it directly. If the codegen types it as `string`, change `query: { count: debouncedCount }` to `query: { count: String(debouncedCount) }`. Verify by running typecheck after this step.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @mirage/web run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/dashboard/schemas/SchemaSidePanel/useDebouncedValue.ts apps/web/src/pages/dashboard/schemas/SchemaSidePanel/useSchemaDryRun.ts
git commit -m "feat(web): add useDebouncedValue and useSchemaDryRun hooks"
```

---

## Task 8: Create the `JsonNode` recursive renderer

**Files:**
- Create: `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/JsonNode.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@mirage/ui-kit';

export interface JsonNodeProps {
  value: unknown;
  /** Label shown to the left (e.g. the field name). Omit for the root. */
  label?: string;
  /** Initially expanded? Defaults to true for the top two levels. */
  defaultExpanded?: boolean;
  depth?: number;
}

export function JsonNode({ value, label, defaultExpanded, depth = 0 }: JsonNodeProps) {
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const collapsible = isObject || isArray;

  const [expanded, setExpanded] = useState<boolean>(
    defaultExpanded ?? depth < 2,
  );

  if (!collapsible) {
    return (
      <div className="flex items-baseline gap-2 py-0.5 font-mono text-[12px]">
        {label !== undefined && (
          <span className="text-muted-foreground">{label}:</span>
        )}
        <Primitive value={value} />
      </div>
    );
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  return (
    <div className="font-mono text-[12px]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-baseline gap-1 py-0.5 text-left text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {label !== undefined && <span>{label}:</span>}
        <span className="text-[11px] opacity-70">
          {isArray ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {expanded && (
        <div className={cn('border-l border-border pl-3', depth === 0 ? 'ml-0.5' : 'ml-1')}>
          {entries.map(([k, v]) => (
            <JsonNode key={k} label={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-muted-foreground italic">null</span>;
  if (typeof value === 'string') return <span className="text-brand-violet">"{value}"</span>;
  if (typeof value === 'number') return <span className="text-foreground">{value}</span>;
  if (typeof value === 'boolean')
    return <span className="text-foreground">{value ? 'true' : 'false'}</span>;
  return <span className="text-foreground">{String(value)}</span>;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/web run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/dashboard/schemas/SchemaSidePanel/JsonNode.tsx
git commit -m "feat(web): add JsonNode recursive renderer for preview"
```

---

## Task 9: Create `EditTabContent` (extract from `PropDetailDrawer`)

`EditTabContent` is the body of the old drawer, minus the absolute positioning, header bar, and `X` close button. The footer (Duplicate / Remove) is kept; a new "← Back to preview" link is added at the top.

**Files:**
- Create: `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/EditTabContent.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Trash2 } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { Schema, SchemaProp } from '../lib/types.js';
import { TYPE_OPTIONS } from '../lib/types.js';
import { FakerCell } from '../PropertyEditor/FakerCell.js';
import { applyTypeChange } from '../PropertyEditor/PropertyEditorRow.js';

export interface EditTabContentProps {
  prop: SchemaProp | null;
  workspaceSchemas: Schema[];
  onChange: (next: SchemaProp) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onBack: () => void;
}

export function EditTabContent({
  prop,
  workspaceSchemas,
  onChange,
  onDuplicate,
  onRemove,
  onBack,
}: EditTabContentProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => setPickerOpen(false), [prop?.name, prop?.type]);

  if (!prop) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
        Select a property in the editor to edit it here.
      </div>
    );
  }

  const isContainer = prop.type === 'object' || prop.type === 'array';
  const isArrayItem = prop.name === '';
  const currentValue = `${prop.type}${prop.format ? `|${prop.format}` : ''}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-center gap-2 border-b border-border px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft size={12} /> Back to preview
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-3">
          {!isArrayItem && (
            <Field label="Name">
              <input
                value={prop.name}
                onChange={(e) => onChange({ ...prop, name: e.target.value })}
                placeholder="fieldName"
                className="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-[12.5px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
              />
            </Field>
          )}

          <Field label="Type">
            <select
              value={currentValue}
              onChange={(e) => {
                const [t, f] = e.target.value.split('|');
                onChange(applyTypeChange(prop, t as SchemaProp['type'], f as SchemaProp['format']));
              }}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-[12.5px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          {!isContainer && (
            <Field label="Faker / $ref">
              <FakerCell
                value={prop.faker ?? ''}
                onChange={(v) => {
                  const next: SchemaProp = { ...prop };
                  if (v) next.faker = v;
                  else delete next.faker;
                  onChange(next);
                }}
                open={pickerOpen}
                onToggle={() => setPickerOpen((v) => !v)}
                workspaceSchemas={workspaceSchemas}
                invalid={false}
              />
            </Field>
          )}

          {!isArrayItem && (
            <Field label="Required">
              <button
                type="button"
                role="switch"
                aria-checked={prop.required}
                onClick={() => onChange({ ...prop, required: !prop.required })}
                className={cn(
                  'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
                  prop.required ? 'bg-foreground' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'h-4 w-4 rounded-full bg-background transition-transform',
                    prop.required ? 'translate-x-4' : 'translate-x-0',
                  )}
                />
              </button>
            </Field>
          )}
        </div>
      </div>

      {!isArrayItem && (
        <div className="flex flex-none items-center justify-end gap-2 border-t border-border bg-card px-4 py-3">
          <button
            type="button"
            onClick={onDuplicate}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[12px] font-medium hover:bg-accent"
          >
            <Copy size={12} /> Duplicate
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 text-[12px] font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={12} /> Remove
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/web run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/dashboard/schemas/SchemaSidePanel/EditTabContent.tsx
git commit -m "feat(web): add EditTabContent extracted from PropDetailDrawer"
```

---

## Task 10: Create `PreviewTabContent`

**Files:**
- Create: `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/PreviewTabContent.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { Schema } from '../lib/types.js';
import { JsonNode } from './JsonNode.js';
import type { DryRunState } from './useSchemaDryRun.js';

export interface PreviewTabContentProps {
  draft: Schema;
  count: number;
  onCountChange: (n: number) => void;
  state: DryRunState;
}

export function PreviewTabContent({
  draft,
  count,
  onCountChange,
  state,
}: PreviewTabContentProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          {state.isFetching ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Generating…
            </>
          ) : (
            <span>Live preview</span>
          )}
        </div>
        <CountStepper value={count} onChange={onCountChange} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {state.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[12px] text-destructive">
            <div className="font-medium">Fix errors to preview</div>
            <div className="mt-1 opacity-90">{state.error}</div>
          </div>
        ) : !state.data ? (
          <div className="text-[12px] text-muted-foreground">Waiting for first generation…</div>
        ) : (
          <>
            <Section title={`${draft.key} — ${state.data.rows.length} row${state.data.rows.length === 1 ? '' : 's'}`} defaultExpanded>
              {state.data.rows.map((row, i) => (
                <JsonNode key={i} label={`#${i}`} value={row} defaultExpanded={i === 0} />
              ))}
            </Section>

            {Object.entries(state.data.refs).map(([key, rows]) => (
              <Section
                key={key}
                title={`→ ${key} — ${rows.length} row${rows.length === 1 ? '' : 's'}`}
                defaultExpanded={false}
              >
                {rows.map((row, i) => (
                  <JsonNode key={i} label={`#${i}`} value={row} defaultExpanded={i === 0} />
                ))}
              </Section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  defaultExpanded,
  children,
}: {
  title: string;
  defaultExpanded: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <div className="mb-3 rounded-md border border-border bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-3 py-2 text-left text-[12px] font-medium text-foreground hover:bg-accent/40"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{title}</span>
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

function CountStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1 text-[12px]">
      <span className="text-muted-foreground">Rows</span>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-accent disabled:opacity-40',
        )}
      >
        −
      </button>
      <span className="w-6 text-center font-mono">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(10, value + 1))}
        disabled={value >= 10}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-accent disabled:opacity-40',
        )}
      >
        +
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/web run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/dashboard/schemas/SchemaSidePanel/PreviewTabContent.tsx
git commit -m "feat(web): add PreviewTabContent with collapsible ref sections"
```

---

## Task 11: Create the `SchemaSidePanel` tab shell

**Files:**
- Create: `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/SchemaSidePanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from 'react';
import { cn } from '@mirage/ui-kit';
import type { Schema, SchemaProp } from '../lib/types.js';
import type { SchemaBuffer } from '../EditPane/useSchemaBuffer.js';
import { PreviewTabContent } from './PreviewTabContent.js';
import { EditTabContent } from './EditTabContent.js';
import { useSchemaDryRun } from './useSchemaDryRun.js';

export interface SchemaSidePanelProps {
  wsId: string;
  buffer: SchemaBuffer;
  workspaceSchemas: Schema[];
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
}

type Tab = 'preview' | 'edit';

export function SchemaSidePanel({
  wsId,
  buffer,
  workspaceSchemas,
  selectedPath,
  onSelectPath,
}: SchemaSidePanelProps) {
  const [tab, setTab] = useState<Tab>('preview');
  const [count, setCount] = useState(1);

  // Auto-switch to edit when a property is selected.
  useEffect(() => {
    if (selectedPath) setTab('edit');
    else setTab('preview');
  }, [selectedPath]);

  const dry = useSchemaDryRun(wsId, buffer.draft, count, tab === 'preview');

  const selectedProp = selectedPath ? buffer.getByPath(selectedPath) : null;

  const handleEditChange = (next: SchemaProp): void => {
    if (!selectedPath || !selectedProp) return;
    const prevName = selectedProp.name;
    buffer.updateByPath(selectedPath, () => next);
    if (next.name !== prevName) {
      const idx = selectedPath.lastIndexOf('.');
      const parent = idx >= 0 ? selectedPath.slice(0, idx) : '';
      onSelectPath(parent ? `${parent}.${next.name}` : next.name);
    }
  };

  const handleEditDuplicate = (): void => {
    if (!selectedPath) return;
    const newPath = buffer.duplicateByPath(selectedPath);
    if (newPath) onSelectPath(newPath);
  };

  const handleEditRemove = (): void => {
    if (!selectedPath) return;
    buffer.removeByPath(selectedPath);
    onSelectPath(null);
  };

  return (
    <aside className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex h-12 flex-none items-center gap-1 border-b border-border px-2">
        <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>
          Preview
        </TabButton>
        <TabButton
          active={tab === 'edit'}
          disabled={!selectedPath}
          onClick={() => selectedPath && setTab('edit')}
        >
          Edit property
        </TabButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'preview' ? (
          <PreviewTabContent
            draft={buffer.draft}
            count={count}
            onCountChange={setCount}
            state={dry}
          />
        ) : (
          <EditTabContent
            prop={selectedProp}
            workspaceSchemas={workspaceSchemas}
            onChange={handleEditChange}
            onDuplicate={handleEditDuplicate}
            onRemove={handleEditRemove}
            onBack={() => onSelectPath(null)}
          />
        )}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-8 rounded-md px-3 text-[12.5px] font-medium transition-colors',
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground',
      )}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/web run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/dashboard/schemas/SchemaSidePanel/SchemaSidePanel.tsx
git commit -m "feat(web): add SchemaSidePanel tab shell with Preview/Edit tabs"
```

---

## Task 12: Wire `SchemaSidePanel` into `SchemasPage`; delete old panel + drawer

**Files:**
- Modify: `apps/web/src/pages/dashboard/SchemasPage.tsx`
- Modify: `apps/web/src/pages/dashboard/schemas/EditPane/EditPane.tsx`
- Delete: `apps/web/src/pages/dashboard/schemas/PreviewPane.tsx`
- Delete: `apps/web/src/pages/dashboard/schemas/EditPane/PropDetailDrawer.tsx`

- [ ] **Step 1: Replace `PreviewPane` import in `SchemasPage.tsx`**

In `apps/web/src/pages/dashboard/SchemasPage.tsx`, replace the line:

```ts
import { PreviewPane } from './schemas/PreviewPane.js';
```

with:

```ts
import { SchemaSidePanel } from './schemas/SchemaSidePanel/SchemaSidePanel.js';
```

In the JSX, replace `<PreviewPane wsId={wsId!} />` with:

```tsx
<SchemaSidePanel
  wsId={wsId!}
  buffer={buffer}
  workspaceSchemas={schemas}
  selectedPath={selectedPath}
  onSelectPath={setSelectedPath}
/>
```

- [ ] **Step 2: Remove the drawer from `EditPane.tsx`**

In `apps/web/src/pages/dashboard/schemas/EditPane/EditPane.tsx`:

- Remove the import `import { PropDetailDrawer } from './PropDetailDrawer.js';`
- Remove the entire `<PropDetailDrawer ... />` JSX block (currently surrounding lines 293–301).
- Remove the now-unused helpers `handleDrawerChange`, `handleDrawerDuplicate`, `handleDrawerRemove` (these are owned by `SchemaSidePanel` now).
- Remove the `selectedProp` `useMemo` and the `useEffect` that cleared `selectedPath` based on it — `SchemaSidePanel` will see `selectedProp === null` via `buffer.getByPath` if the path becomes invalid, and that's handled inside the panel.
- Inside `<PropertyEditor ... />`, keep `selectedPath={selectedPath} onSelectPath={onSelectPath}` as-is (already wired in Task 6).

- [ ] **Step 3: Delete the old files**

```bash
rm apps/web/src/pages/dashboard/schemas/PreviewPane.tsx
rm apps/web/src/pages/dashboard/schemas/EditPane/PropDetailDrawer.tsx
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @mirage/web run typecheck
```

Expected: exit 0. If TypeScript complains about an unused import in `EditPane.tsx` (e.g. `SchemaProp` no longer needed), remove the import.

- [ ] **Step 5: Lint**

```bash
pnpm --filter @mirage/web run lint
```

Expected: exit 0.

- [ ] **Step 6: Manual verification in the browser**

```bash
pnpm --filter @mirage/web run dev
```

Walk through these scenarios:

1. **Open Schemas page.** Right panel shows the Preview tab with "Generating…" then a JSON tree for the active schema's row.
2. **Edit a property name.** ~400 ms later the preview JSON updates and the field name in the JSON changes.
3. **Add a `$ref:` field** pointing to another existing schema's id field. The referenced schema appears as a collapsible section below the main rows. The `$ref:` field in the main row shows the same value as the referenced schema's id field.
4. **Bump the row stepper from 1 → 5.** Five rows appear in both the main section and the referenced section.
5. **Click a property in the editor.** Right panel auto-switches to the Edit tab. The selected property's name, type, faker, required toggle are editable inline. No popup overlay.
6. **Click "Back to preview".** Selection clears, Preview tab is active again.
7. **Introduce a validation error** (e.g. duplicate property name). Preview area shows "Fix errors to preview" with the validator message.
8. **Switch to a different schema in the left list.** Right panel resets to Preview with new data.

Stop the dev server (Ctrl+C) when done.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/dashboard/SchemasPage.tsx apps/web/src/pages/dashboard/schemas/EditPane/EditPane.tsx
git add -u apps/web/src/pages/dashboard/schemas/PreviewPane.tsx apps/web/src/pages/dashboard/schemas/EditPane/PropDetailDrawer.tsx
git commit -m "feat(web): replace PreviewPane and PropDetailDrawer with SchemaSidePanel"
```

---

## Final Verification

- [ ] **Full repo typecheck**

```bash
pnpm -r run typecheck
```

Expected: exit 0 across all packages.

- [ ] **Full repo lint**

```bash
pnpm -r run lint
```

Expected: exit 0.

- [ ] **Engine test suite**

```bash
pnpm --filter @mirage/engine exec vitest run
```

Expected: all green.

- [ ] **End-to-end manual walkthrough** repeating the eight scenarios from Task 12 Step 6.
