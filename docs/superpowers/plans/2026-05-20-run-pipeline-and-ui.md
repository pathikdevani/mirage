# Run Pipeline + UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No auto-commit:** The user has standing instructions not to run `git commit`. Skip any commit steps — verify with `pnpm typecheck` instead. The user will commit when they want to.

**Goal:** Wire the existing engine into an end-to-end Run pipeline: an SPA user clicks **Run set**, a BullMQ job loads Set/Schemas/Functions from Mongo, executes via `engine.runSet`, streams NDJSON to MinIO, publishes progress over Redis pub/sub, the BFF fans events out over WebSocket, and the SPA renders live progress + a paged Preview tab + a HistoryPage.

**Architecture:**
- **workspace-svc** owns the `runs` Mongo collection, the BullMQ producer (`mirage-runs` queue), the cancel-flag setter, artifact eviction, and the NDJSON preview endpoint.
- **BFF** proxies the new REST routes and rewrites `/ws` to a real Redis-pub/sub fan-out (one Redis subscriber, many WS clients, runId-keyed subscriptions, token-via-query auth).
- **generation-worker** rewrites the BullMQ processor to load from Mongo, run the engine on a shared `SandboxPool`, stream NDJSON to S3 via `@aws-sdk/lib-storage` multipart upload, poll a Redis cancel flag between schemas, and publish `run.*` events.
- **web** adds `RunControl` (inline Run button + progress + cancel), `PreviewTab` rewrite (paged table per schema), `HistoryPage` rewrite, a Zustand `runs` slice, a WS singleton, and a shared `RunStatusBadge`.

**Tech Stack:** TypeScript, Fastify 5, BullMQ + ioredis, MongoDB 6, `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`, React 19 + Zustand 5 + TanStack Query 5 + react-router 7 + Tailwind 4, `@fastify/websocket`.

---

## File map

### Created
- `apps/workspace-svc/src/routes/runs.ts` — runs REST routes (enqueue, cancel, list, get, preview)
- `apps/workspace-svc/src/s3.ts` — S3 client + `runArtifactKey` helper
- `apps/workspace-svc/src/redis.ts` — single ioredis client for cancel-flag SETs
- `apps/workspace-svc/src/queue.ts` — BullMQ producer (Queue + `enqueueRunJob`)
- `apps/bff/src/routes/runs.ts` — BFF proxy
- `apps/generation-worker/src/db.ts` — Mongo client + collection handles
- `apps/generation-worker/src/loaders.ts` — load Set + Schemas + CustomFunctions
- `apps/generation-worker/src/sandbox-singleton.ts` — process-level `SandboxPool`
- `apps/generation-worker/src/cancel.ts` — Redis cancel-flag polling helper
- `apps/generation-worker/src/artifact-writer.ts` — NDJSON → S3 multipart upload
- `apps/generation-worker/src/s3.ts` — S3 client construction (shared)
- `apps/web/src/api/ws.ts` — WS singleton (subscribe/unsubscribe API)
- `apps/web/src/state/runs.ts` — Zustand `setRuns` map
- `apps/web/src/components/RunStatusBadge.tsx` — shared status pill
- `apps/web/src/components/WsProvider.tsx` — opens WS on auth-ready
- `apps/web/src/pages/dashboard/sets/RunControl.tsx` — Run/Cancel button + progress

### Modified
- `packages/types/openapi.yaml` — add `Run`, `RunListItem`, `RunPreviewPage` schemas + 5 routes
- `apps/workspace-svc/src/db.ts` — add `runs` collection + indexes
- `apps/workspace-svc/src/env.ts` — add Redis + S3 env vars
- `apps/workspace-svc/src/server.ts` — wire `registerRunRoutes`
- `apps/workspace-svc/package.json` — add `bullmq`, `ioredis`, `@aws-sdk/client-s3`
- `apps/bff/src/server.ts` — wire `registerRunProxyRoutes`
- `apps/bff/src/routes/ws.ts` — Redis subscribe/fan-out + token-via-query auth
- `apps/generation-worker/src/processor.ts` — full rewrite
- `apps/generation-worker/src/env.ts` — add Mongo + S3 env vars
- `apps/generation-worker/src/main.ts` — wire new processor deps + `shutdownSandbox()`
- `apps/generation-worker/package.json` — add `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `mongodb`
- `apps/web/src/main.tsx` — wrap tree with `<WsProvider>`
- `apps/web/src/pages/dashboard/sets/DetailPane.tsx` — replace disabled button with `<RunControl />`, pass props to `<PreviewTab />`
- `apps/web/src/pages/dashboard/sets/PreviewTab.tsx` — rewrite to paged table
- `apps/web/src/pages/dashboard/HistoryPage.tsx` — rewrite to runs list

---

## Phase 1 — Types & OpenAPI

### Task 1: Add Run, RunListItem, RunPreviewPage to OpenAPI + 5 routes

**Files:**
- Modify: `packages/types/openapi.yaml`

The repo already has hand-written `Run` / `RunStatus` / `RunKind` types in `packages/types/src/run.ts`. We need the **OpenAPI** versions so the typed BFF client (`openapi-fetch`) knows the routes.

- [ ] **Step 1: Add schemas in `components.schemas:` after `CustomFunction` (line 748) and before `CreateCustomFunctionBody` (line 776)**

Insert before the `CreateCustomFunctionBody:` line:

```yaml
    Run:
      type: object
      required: [id, orgId, workspaceId, setId, kind, status, requestedBy, createdAt]
      additionalProperties: false
      properties:
        id: { type: string }
        orgId: { type: string }
        workspaceId: { type: string }
        setId: { type: string }
        kind: { type: string, enum: [full, preview] }
        status: { type: string, enum: [queued, running, completed, failed, cancelled] }
        artifactKey: { type: string }
        rowCounts:
          type: object
          additionalProperties: { type: integer }
        startedAt: { type: string, format: date-time }
        endedAt: { type: string, format: date-time }
        errorMessage: { type: string }
        requestedBy: { type: string }
        createdAt: { type: string, format: date-time }

    RunListItem:
      type: object
      required: [id, setId, status, kind, requestedBy, createdAt]
      additionalProperties: false
      properties:
        id: { type: string }
        setId: { type: string }
        status: { type: string, enum: [queued, running, completed, failed, cancelled] }
        kind: { type: string, enum: [full, preview] }
        startedAt: { type: string, format: date-time }
        endedAt: { type: string, format: date-time }
        rowCounts:
          type: object
          additionalProperties: { type: integer }
        errorMessage: { type: string }
        requestedBy: { type: string }
        createdAt: { type: string, format: date-time }

    RunPreviewPage:
      type: object
      required: [schemaKey, offset, total, rows]
      additionalProperties: false
      properties:
        schemaKey: { type: string }
        offset: { type: integer, minimum: 0 }
        total: { type: integer }
        rows:
          type: array
          items: {}
```

- [ ] **Step 2: Add 5 routes under `paths:` (after the existing `/workspaces/{wsId}/sets/{id}/edges` route)**

```yaml
  /workspaces/{wsId}/sets/{id}/run:
    post:
      summary: Enqueue a full Run for a Set
      operationId: runSet
      parameters:
        - in: path
          name: wsId
          required: true
          schema: { type: string }
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '201':
          description: Run created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Run' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/BadRequest' }
        '404': { $ref: '#/components/responses/BadRequest' }

  /workspaces/{wsId}/runs/{id}/cancel:
    post:
      summary: Cancel a Run
      operationId: cancelRun
      parameters:
        - in: path
          name: wsId
          required: true
          schema: { type: string }
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '204': { description: Cancellation requested }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/BadRequest' }
        '404': { $ref: '#/components/responses/BadRequest' }

  /workspaces/{wsId}/runs:
    get:
      summary: List Runs in a workspace
      operationId: listRuns
      parameters:
        - in: path
          name: wsId
          required: true
          schema: { type: string }
        - in: query
          name: setId
          schema: { type: string }
        - in: query
          name: status
          schema: { type: string, enum: [queued, running, completed, failed, cancelled] }
        - in: query
          name: limit
          schema: { type: integer, minimum: 1, maximum: 500, default: 50 }
        - in: query
          name: offset
          schema: { type: integer, minimum: 0, default: 0 }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/RunListItem' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /workspaces/{wsId}/runs/{id}:
    get:
      summary: Get a single Run
      operationId: getRun
      parameters:
        - in: path
          name: wsId
          required: true
          schema: { type: string }
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Run' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/BadRequest' }

  /workspaces/{wsId}/runs/{id}/preview:
    get:
      summary: Page through a Run's NDJSON artifact
      operationId: getRunPreview
      parameters:
        - in: path
          name: wsId
          required: true
          schema: { type: string }
        - in: path
          name: id
          required: true
          schema: { type: string }
        - in: query
          name: schemaKey
          required: true
          schema: { type: string }
        - in: query
          name: offset
          schema: { type: integer, minimum: 0, default: 0 }
        - in: query
          name: limit
          schema: { type: integer, minimum: 1, maximum: 1000, default: 200 }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/RunPreviewPage' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/BadRequest' }
```

- [ ] **Step 3: Regenerate OpenAPI types**

Run: `pnpm gen:openapi`
Expected: `packages/types/src/openapi.generated.ts` rewritten without errors.

---

## Phase 2 — workspace-svc backend

### Task 2: Add deps + env vars to workspace-svc

**Files:**
- Modify: `apps/workspace-svc/package.json`
- Modify: `apps/workspace-svc/src/env.ts`

- [ ] **Step 1: Update `dependencies` in `apps/workspace-svc/package.json`**

Add `bullmq`, `ioredis`, `@aws-sdk/client-s3`. Final block:

```json
  "dependencies": {
    "@aws-sdk/client-s3": "^3.726.0",
    "@mirage/auth": "workspace:*",
    "@mirage/engine": "workspace:*",
    "@mirage/types": "workspace:*",
    "bullmq": "^5.34.5",
    "fastify": "^5.2.1",
    "ioredis": "^5.4.2",
    "mongodb": "^6.12.0",
    "nanoid": "^5.0.9"
  },
```

Match the `@aws-sdk/client-s3` version to whatever `apps/export-svc/package.json` already uses; check that file first and substitute.

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updated, no errors.

- [ ] **Step 3: Replace `apps/workspace-svc/src/env.ts`**

```ts
const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const optional = (name: string, fallback: string): string =>
  process.env[name] && process.env[name]!.length > 0 ? process.env[name]! : fallback;

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),
  port: Number.parseInt(optional('WORKSPACE_SVC_PORT', '4001'), 10),
  mongoUrl: required('MONGO_URL'),
  mongoDb: optional('MONGO_DB', 'mirage'),
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),
  keycloak: {
    issuer: required('KEYCLOAK_ISSUER'),
    jwksUri: required('KEYCLOAK_JWKS_URI'),
  },
  s3: {
    endpoint: optional('S3_ENDPOINT', 'http://localhost:9000'),
    region: optional('S3_REGION', 'us-east-1'),
    accessKey: optional('S3_ACCESS_KEY', 'miragedev'),
    secretKey: optional('S3_SECRET_KEY', 'miragedev-secret'),
    bucket: optional('S3_BUCKET', 'mirage'),
    forcePathStyle: optional('S3_FORCE_PATH_STYLE', 'true') === 'true',
  },
} as const;
```

---

### Task 3: Add `runs` collection + indexes

**Files:**
- Modify: `apps/workspace-svc/src/db.ts`

- [ ] **Step 1: Replace `apps/workspace-svc/src/db.ts`**

```ts
import { MongoClient, type Collection, type Db } from 'mongodb';
import type { Api, Membership, OrgId, UserId, Workspace, WorkspaceId } from '@mirage/types';
import { env } from './env.js';

export type SchemaDoc = Api.components['schemas']['Schema'];
export type SetDoc = Api.components['schemas']['Set'];
export type CustomFunctionDoc = Api.components['schemas']['CustomFunction'];
export type RunDoc = Api.components['schemas']['Run'];

export interface MirageDb {
  client: MongoClient;
  db: Db;
  workspaces: Collection<Workspace>;
  memberships: Collection<Membership>;
  schemas: Collection<SchemaDoc>;
  sets: Collection<SetDoc>;
  customFunctions: Collection<CustomFunctionDoc>;
  runs: Collection<RunDoc>;
}

export async function connectDb(): Promise<MirageDb> {
  const client = new MongoClient(env.mongoUrl, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(env.mongoDb);

  const workspaces = db.collection<Workspace>('workspaces');
  const memberships = db.collection<Membership>('memberships');
  const schemas = db.collection<SchemaDoc>('schemas');
  const sets = db.collection<SetDoc>('sets');
  const customFunctions = db.collection<CustomFunctionDoc>('custom_functions');
  const runs = db.collection<RunDoc>('runs');

  await Promise.all([
    workspaces.createIndex({ orgId: 1, id: 1 }, { unique: true }),
    workspaces.createIndex({ orgId: 1, updatedAt: -1 }),
    memberships.createIndex({ userId: 1, orgId: 1, workspaceId: 1 }, { unique: true }),
    memberships.createIndex({ orgId: 1, userId: 1 }),
    schemas.createIndex({ workspaceId: 1, key: 1 }, { unique: true }),
    schemas.createIndex({ workspaceId: 1, updatedAt: -1 }),
    schemas.createIndex({ orgId: 1, workspaceId: 1 }),
    sets.createIndex({ workspaceId: 1, key: 1 }, { unique: true }),
    sets.createIndex({ workspaceId: 1, updatedAt: -1 }),
    sets.createIndex({ orgId: 1, workspaceId: 1 }),
    customFunctions.createIndex({ workspaceId: 1, name: 1 }, { unique: true }),
    customFunctions.createIndex({ workspaceId: 1, updatedAt: -1 }),
    customFunctions.createIndex({ orgId: 1, workspaceId: 1 }),
    runs.createIndex({ id: 1 }, { unique: true }),
    runs.createIndex({ orgId: 1, workspaceId: 1, createdAt: -1 }),
    runs.createIndex({ workspaceId: 1, setId: 1, createdAt: -1 }),
    runs.createIndex({ workspaceId: 1, status: 1, createdAt: -1 }),
  ]);

  return { client, db, workspaces, memberships, schemas, sets, customFunctions, runs };
}

export function makeMembershipResolver(db: MirageDb) {
  return async (userId: UserId, orgId: OrgId) => {
    const existing = await db.memberships.findOne({
      userId,
      orgId,
      workspaceId: { $exists: false },
    });
    if (existing) return { role: existing.role };

    const seeded: Membership = { userId, orgId, role: 'editor' };
    await db.memberships.insertOne(seeded);
    return { role: seeded.role };
  };
}

export type { Workspace, WorkspaceId };
```

---

### Task 4: S3 + Redis + Queue producer helpers

**Files:**
- Create: `apps/workspace-svc/src/s3.ts`
- Create: `apps/workspace-svc/src/redis.ts`
- Create: `apps/workspace-svc/src/queue.ts`

- [ ] **Step 1: Write `apps/workspace-svc/src/s3.ts`**

```ts
import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';

export const s3 = new S3Client({
  endpoint: env.s3.endpoint,
  region: env.s3.region,
  credentials: { accessKeyId: env.s3.accessKey, secretAccessKey: env.s3.secretKey },
  forcePathStyle: env.s3.forcePathStyle,
});

export const runArtifactKey = (orgId: string, workspaceId: string, runId: string): string =>
  `org/${orgId}/workspace/${workspaceId}/run/${runId}.ndjson`;
```

- [ ] **Step 2: Write `apps/workspace-svc/src/redis.ts`**

```ts
import IORedis from 'ioredis';
import { env } from './env.js';

export const redis = new IORedis(env.redisUrl);
```

- [ ] **Step 3: Write `apps/workspace-svc/src/queue.ts`**

```ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { OrgId, RunId, RunKind, SetId, UserId, WorkspaceId } from '@mirage/types';
import { env } from './env.js';

export const RUNS_QUEUE = 'mirage-runs' as const;

export interface RunJobData {
  runId: RunId;
  setId: SetId;
  orgId: OrgId;
  workspaceId: WorkspaceId;
  requestedBy: UserId;
  kind: RunKind;
}

const producerConnection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });

export const runsQueue = new Queue<RunJobData>(RUNS_QUEUE, { connection: producerConnection });

export async function enqueueRunJob(data: RunJobData): Promise<void> {
  await runsQueue.add('run', data, {
    jobId: data.runId,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400 },
  });
}

export const cancelFlagKey = (runId: RunId): string => `run:${runId}:cancel`;
```

---

### Task 5: workspace-svc — runs REST routes

**Files:**
- Create: `apps/workspace-svc/src/routes/runs.ts`
- Modify: `apps/workspace-svc/src/server.ts`

- [ ] **Step 1: Write `apps/workspace-svc/src/routes/runs.ts`**

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import { asId, type Api, type OrgId, type RunId, type SetId, type UserId, type WorkspaceId } from '@mirage/types';
import type { MirageDb, RunDoc } from '../db.js';
import { env } from '../env.js';
import { s3 } from '../s3.js';
import { redis } from '../redis.js';
import { cancelFlagKey, enqueueRunJob } from '../queue.js';

type Run = Api.components['schemas']['Run'];
type RunListItem = Api.components['schemas']['RunListItem'];
type RunPreviewPage = Api.components['schemas']['RunPreviewPage'];

interface IdParams { wsId: string; id: string }
interface ListParams { wsId: string }
interface ListQuery { setId?: string; status?: Run['status']; limit?: string; offset?: string }
interface PreviewQuery { schemaKey: string; offset?: string; limit?: string }

export function registerRunRoutes(app: FastifyInstance, db: MirageDb): void {
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

  app.post<{ Params: IdParams }>('/workspaces/:wsId/sets/:id/run', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    if (ctx.auth.role === 'viewer') {
      return reply.code(403).send({ error: 'viewer cannot run sets' });
    }
    const set = await db.sets.findOne(
      { workspaceId: request.params.wsId, id: request.params.id },
      { projection: { _id: 0 } },
    );
    if (!set) return reply.code(404).send({ error: 'set not found' });

    const previous = await db.runs.findOne(
      { workspaceId: request.params.wsId, setId: request.params.id, artifactKey: { $exists: true, $ne: null } },
      { sort: { createdAt: -1 }, projection: { _id: 0 } },
    );
    if (previous?.artifactKey) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: previous.artifactKey }));
      } catch (err) {
        request.log.warn({ err, runId: previous.id }, 'failed to evict previous artifact');
      }
      await db.runs.updateOne({ id: previous.id }, { $unset: { artifactKey: '' } });
    }

    const now = new Date().toISOString();
    const run: Run = {
      id: `run_${nanoid(16)}`,
      orgId: ctx.workspace.orgId as string,
      workspaceId: request.params.wsId,
      setId: request.params.id,
      kind: 'full',
      status: 'queued',
      requestedBy: ctx.auth.userId as string,
      createdAt: now,
    };
    await db.runs.insertOne(run as RunDoc);

    await enqueueRunJob({
      runId: asId<RunId>(run.id),
      setId: asId<SetId>(run.setId),
      orgId: asId<OrgId>(run.orgId),
      workspaceId: asId<WorkspaceId>(run.workspaceId),
      requestedBy: asId<UserId>(run.requestedBy),
      kind: 'full',
    });

    return reply.code(201).send(run);
  });

  app.post<{ Params: IdParams }>('/workspaces/:wsId/runs/:id/cancel', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    if (ctx.auth.role === 'viewer') {
      return reply.code(403).send({ error: 'viewer cannot cancel runs' });
    }
    const run = await db.runs.findOne(
      { workspaceId: request.params.wsId, id: request.params.id },
      { projection: { _id: 0 } },
    );
    if (!run) return reply.code(404).send({ error: 'run not found' });

    await redis.set(cancelFlagKey(asId<RunId>(run.id)), '1', 'EX', 600);
    return reply.code(204).send();
  });

  app.get<{ Params: ListParams; Querystring: ListQuery }>('/workspaces/:wsId/runs', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    const limit = Math.min(Math.max(Number.parseInt(request.query.limit ?? '50', 10) || 50, 1), 500);
    const offset = Math.max(Number.parseInt(request.query.offset ?? '0', 10) || 0, 0);
    const filter: Record<string, unknown> = { workspaceId: request.params.wsId };
    if (request.query.setId) filter.setId = request.query.setId;
    if (request.query.status) filter.status = request.query.status;
    const list = await db.runs
      .find(filter, { sort: { createdAt: -1 }, skip: offset, limit, projection: { _id: 0 } })
      .toArray();
    const projected: RunListItem[] = list.map((r) => ({
      id: r.id,
      setId: r.setId,
      status: r.status,
      kind: r.kind,
      ...(r.startedAt ? { startedAt: r.startedAt } : {}),
      ...(r.endedAt ? { endedAt: r.endedAt } : {}),
      ...(r.rowCounts ? { rowCounts: r.rowCounts } : {}),
      ...(r.errorMessage ? { errorMessage: r.errorMessage } : {}),
      requestedBy: r.requestedBy,
      createdAt: r.createdAt,
    }));
    return reply.send(projected);
  });

  app.get<{ Params: IdParams }>('/workspaces/:wsId/runs/:id', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    const run = await db.runs.findOne(
      { workspaceId: request.params.wsId, id: request.params.id },
      { projection: { _id: 0 } },
    );
    if (!run) return reply.code(404).send({ error: 'run not found' });
    return reply.send(run);
  });

  app.get<{ Params: IdParams; Querystring: PreviewQuery }>(
    '/workspaces/:wsId/runs/:id/preview',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      if (!request.query.schemaKey) {
        return reply.code(400).send({ error: 'schemaKey is required' });
      }
      const run = await db.runs.findOne(
        { workspaceId: request.params.wsId, id: request.params.id },
        { projection: { _id: 0 } },
      );
      if (!run) return reply.code(404).send({ error: 'run not found' });
      if (!run.artifactKey) return reply.code(404).send({ error: 'no artifact' });

      const schemaKey = request.query.schemaKey;
      const offset = Math.max(Number.parseInt(request.query.offset ?? '0', 10) || 0, 0);
      const limit = Math.min(Math.max(Number.parseInt(request.query.limit ?? '200', 10) || 200, 1), 1000);
      const knownTotal = run.rowCounts?.[schemaKey];

      let obj;
      try {
        obj = await s3.send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: run.artifactKey }));
      } catch (err) {
        if (err instanceof NoSuchKey) return reply.code(404).send({ error: 'artifact missing' });
        throw err;
      }
      if (!obj.Body) return reply.code(500).send({ error: 'empty artifact body' });
      const stream = obj.Body as NodeJS.ReadableStream;

      const rows: unknown[] = [];
      let totalSeen = 0;
      let buf = '';
      const stopEarly = typeof knownTotal === 'number';

      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          stream.removeListener('data', onData);
          stream.removeListener('end', onEnd);
          stream.removeListener('error', onError);
          resolve();
        };
        const onData = (chunk: Buffer) => {
          if (finished) return;
          buf += chunk.toString('utf8');
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line) continue;
            try {
              const parsed = JSON.parse(line) as { __schemaKey?: string };
              if (parsed.__schemaKey !== schemaKey) continue;
              if (totalSeen >= offset && rows.length < limit) rows.push(parsed);
              totalSeen++;
              if (stopEarly && rows.length >= limit) {
                finish();
                return;
              }
            } catch {
              // skip malformed line
            }
          }
        };
        const onEnd = () => {
          if (buf.trim().length > 0) {
            try {
              const parsed = JSON.parse(buf) as { __schemaKey?: string };
              if (parsed.__schemaKey === schemaKey) {
                if (totalSeen >= offset && rows.length < limit) rows.push(parsed);
                totalSeen++;
              }
            } catch {
              // ignore trailing
            }
          }
          finish();
        };
        const onError = (err: Error) => {
          if (finished) return;
          finished = true;
          reject(err);
        };
        stream.on('data', onData);
        stream.on('end', onEnd);
        stream.on('error', onError);
      });

      const total = typeof knownTotal === 'number' ? knownTotal : totalSeen;
      const page: RunPreviewPage = { schemaKey, offset, total, rows };
      return reply.send(page);
    },
  );
}
```

- [ ] **Step 2: Wire into `apps/workspace-svc/src/server.ts`**

Add import:

```ts
import { registerRunRoutes } from './routes/runs.js';
```

Add the call after `registerCustomFunctionRoutes`:

```ts
  registerCustomFunctionRoutes(app, database);
  registerRunRoutes(app, database);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm nx run @mirage/workspace-svc:typecheck`
Expected: clean.

---

## Phase 3 — BFF proxy + WebSocket fan-out

### Task 6: BFF proxy routes for runs

**Files:**
- Create: `apps/bff/src/routes/runs.ts`
- Modify: `apps/bff/src/server.ts`

- [ ] **Step 1: Write `apps/bff/src/routes/runs.ts`**

Mirror the `forward()` helper pattern from `apps/bff/src/routes/sets.ts:9-42`.

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
  if (request.headers.authorization) headers['authorization'] = request.headers.authorization;
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

const enc = encodeURIComponent;

export function registerRunProxyRoutes(app: FastifyInstance): void {
  app.post<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/sets/:id/run',
    (req, reply) => forward(req, reply, `/workspaces/${enc(req.params.wsId)}/sets/${enc(req.params.id)}/run`),
  );
  app.post<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/runs/:id/cancel',
    (req, reply) => forward(req, reply, `/workspaces/${enc(req.params.wsId)}/runs/${enc(req.params.id)}/cancel`),
  );
  app.get<{ Params: { wsId: string } }>('/workspaces/:wsId/runs', (req, reply) => {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return forward(req, reply, `/workspaces/${enc(req.params.wsId)}/runs${qs}`);
  });
  app.get<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/runs/:id',
    (req, reply) => forward(req, reply, `/workspaces/${enc(req.params.wsId)}/runs/${enc(req.params.id)}`),
  );
  app.get<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/runs/:id/preview',
    (req, reply) => {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return forward(req, reply, `/workspaces/${enc(req.params.wsId)}/runs/${enc(req.params.id)}/preview${qs}`);
    },
  );
}
```

- [ ] **Step 2: Wire into `apps/bff/src/server.ts`**

Add import:

```ts
import { registerRunProxyRoutes } from './routes/runs.js';
```

Add the call before `registerWsRoute`:

```ts
  registerCustomFunctionProxyRoutes(app);
  registerRunProxyRoutes(app);
  registerWsRoute(app);
```

---

### Task 7: Rewrite WebSocket route — Redis pub/sub + token-via-query auth

**Files:**
- Modify: `apps/bff/src/routes/ws.ts`

Browsers can't set `Authorization` on a WS handshake, so the client passes `?token=...&org=...`. We mark the route `public: true` so the auth plugin doesn't reject it, and verify the token ourselves with `createKeycloakVerifier` from `@mirage/auth`.

- [ ] **Step 1: Replace `apps/bff/src/routes/ws.ts`**

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import IORedis from 'ioredis';
import { createKeycloakVerifier } from '@mirage/auth';
import { env } from '../env.js';

interface SubscribeMessage { type: 'subscribe'; runId: string }
interface UnsubscribeMessage { type: 'unsubscribe'; runId: string }
type ClientMessage = SubscribeMessage | UnsubscribeMessage;

const subscriber = new IORedis(env.redisUrl);
const channelToSockets = new Map<string, Set<WebSocket>>();
const socketChannels = new WeakMap<WebSocket, Set<string>>();

subscriber.on('message', (channel: string, payload: string) => {
  const sockets = channelToSockets.get(channel);
  if (!sockets) return;
  for (const s of sockets) {
    try { s.send(payload); } catch { /* dropped client */ }
  }
});

const runChannel = (orgId: string, runId: string): string => `org:${orgId}:run:${runId}`;

async function attach(channel: string, socket: WebSocket): Promise<void> {
  let set = channelToSockets.get(channel);
  if (!set) {
    set = new Set();
    channelToSockets.set(channel, set);
    await subscriber.subscribe(channel);
  }
  set.add(socket);
  let chans = socketChannels.get(socket);
  if (!chans) {
    chans = new Set();
    socketChannels.set(socket, chans);
  }
  chans.add(channel);
}

async function detach(channel: string, socket: WebSocket): Promise<void> {
  const set = channelToSockets.get(channel);
  if (!set) return;
  set.delete(socket);
  socketChannels.get(socket)?.delete(channel);
  if (set.size === 0) {
    channelToSockets.delete(channel);
    await subscriber.unsubscribe(channel);
  }
}

async function detachAll(socket: WebSocket): Promise<void> {
  const chans = socketChannels.get(socket);
  if (!chans) return;
  for (const c of [...chans]) {
    await detach(c, socket);
  }
}

export function registerWsRoute(app: FastifyInstance): void {
  const verify = createKeycloakVerifier({
    issuer: env.keycloak.issuer,
    jwksUri: env.keycloak.jwksUri,
  });

  app.get(
    '/ws',
    { websocket: true, config: { public: true } },
    async (socket: WebSocket, request: FastifyRequest) => {
      const q = request.query as { token?: string; org?: string };
      const token = typeof q.token === 'string' ? q.token : undefined;
      const orgId = typeof q.org === 'string' ? q.org : undefined;
      if (!token) {
        socket.send(JSON.stringify({ type: 'error', message: 'missing token' }));
        socket.close();
        return;
      }
      if (!orgId) {
        socket.send(JSON.stringify({ type: 'error', message: 'missing org' }));
        socket.close();
        return;
      }
      let claims: { sub: string };
      try {
        claims = (await verify(token)) as { sub: string };
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'invalid token' }));
        socket.close();
        return;
      }

      socket.send(JSON.stringify({ type: 'hello', orgId, userId: claims.sub, at: new Date().toISOString() }));

      socket.on('message', async (raw: Buffer | ArrayBuffer | Buffer[]) => {
        let parsed: ClientMessage;
        try {
          const text = Array.isArray(raw)
            ? Buffer.concat(raw).toString('utf8')
            : Buffer.isBuffer(raw)
              ? raw.toString('utf8')
              : Buffer.from(raw as ArrayBuffer).toString('utf8');
          parsed = JSON.parse(text) as ClientMessage;
        } catch {
          socket.send(JSON.stringify({ type: 'error', message: 'invalid json' }));
          return;
        }
        if (parsed.type === 'subscribe') {
          const ch = runChannel(orgId, parsed.runId);
          await attach(ch, socket);
          socket.send(JSON.stringify({ type: 'subscribed', runId: parsed.runId }));
        } else if (parsed.type === 'unsubscribe') {
          const ch = runChannel(orgId, parsed.runId);
          await detach(ch, socket);
          socket.send(JSON.stringify({ type: 'unsubscribed', runId: parsed.runId }));
        }
      });

      socket.on('close', () => { void detachAll(socket); });
    },
  );
}
```

- [ ] **Step 2: Typecheck the BFF**

Run: `pnpm nx run @mirage/bff:typecheck`
Expected: clean.

---

## Phase 4 — Generation worker

### Task 8: Add deps + env vars to generation-worker

**Files:**
- Modify: `apps/generation-worker/package.json`
- Modify: `apps/generation-worker/src/env.ts`

- [ ] **Step 1: Update `dependencies` in `apps/generation-worker/package.json`**

```json
  "dependencies": {
    "@aws-sdk/client-s3": "^3.726.0",
    "@aws-sdk/lib-storage": "^3.726.0",
    "@mirage/engine": "workspace:*",
    "@mirage/sandbox": "workspace:*",
    "@mirage/types": "workspace:*",
    "bullmq": "^5.34.5",
    "ioredis": "^5.4.2",
    "mongodb": "^6.12.0",
    "pino": "^9.5.0"
  },
```

Match `@aws-sdk/*` versions to whatever is already used by export-svc.

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updated, no errors.

- [ ] **Step 3: Replace `apps/generation-worker/src/env.ts`**

```ts
const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const optional = (name: string, fallback: string): string =>
  process.env[name] && process.env[name]!.length > 0 ? process.env[name]! : fallback;

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),
  runsConcurrency: Number.parseInt(optional('RUNS_CONCURRENCY', '2'), 10),
  previewsConcurrency: Number.parseInt(optional('PREVIEWS_CONCURRENCY', '8'), 10),
  mongoUrl: required('MONGO_URL'),
  mongoDb: optional('MONGO_DB', 'mirage'),
  s3: {
    endpoint: optional('S3_ENDPOINT', 'http://localhost:9000'),
    region: optional('S3_REGION', 'us-east-1'),
    accessKey: optional('S3_ACCESS_KEY', 'miragedev'),
    secretKey: optional('S3_SECRET_KEY', 'miragedev-secret'),
    bucket: optional('S3_BUCKET', 'mirage'),
    forcePathStyle: optional('S3_FORCE_PATH_STYLE', 'true') === 'true',
  },
  sandbox: {
    poolSize: Number.parseInt(optional('SANDBOX_POOL_SIZE', '2'), 10),
    callTimeoutMs: Number.parseInt(optional('SANDBOX_CALL_TIMEOUT_MS', '5000'), 10),
    memoryCapMb: Number.parseInt(optional('SANDBOX_MEMORY_CAP_MB', '64'), 10),
  },
} as const;
```

---

### Task 9: Generation worker — db + loaders + sandbox + cancel + artifact-writer + s3 modules

**Files:**
- Create: `apps/generation-worker/src/db.ts`
- Create: `apps/generation-worker/src/loaders.ts`
- Create: `apps/generation-worker/src/sandbox-singleton.ts`
- Create: `apps/generation-worker/src/cancel.ts`
- Create: `apps/generation-worker/src/s3.ts`
- Create: `apps/generation-worker/src/artifact-writer.ts`

- [ ] **Step 1: Write `apps/generation-worker/src/db.ts`**

```ts
import { MongoClient, type Collection } from 'mongodb';
import type { Api } from '@mirage/types';
import { env } from './env.js';

export type SchemaDoc = Api.components['schemas']['Schema'];
export type SetDoc = Api.components['schemas']['Set'];
export type CustomFunctionDoc = Api.components['schemas']['CustomFunction'];
export type RunDoc = Api.components['schemas']['Run'];

export interface WorkerDb {
  client: MongoClient;
  schemas: Collection<SchemaDoc>;
  sets: Collection<SetDoc>;
  customFunctions: Collection<CustomFunctionDoc>;
  runs: Collection<RunDoc>;
}

export async function connectDb(): Promise<WorkerDb> {
  const client = new MongoClient(env.mongoUrl, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(env.mongoDb);
  return {
    client,
    schemas: db.collection<SchemaDoc>('schemas'),
    sets: db.collection<SetDoc>('sets'),
    customFunctions: db.collection<CustomFunctionDoc>('custom_functions'),
    runs: db.collection<RunDoc>('runs'),
  };
}
```

- [ ] **Step 2: Write `apps/generation-worker/src/loaders.ts`**

```ts
import type { Api } from '@mirage/types';
import type { CustomFunctionRegistry, CustomFunctionEntry } from '@mirage/engine';
import { customFunctionRegistryFromMap } from '@mirage/engine';
import type { WorkerDb, SetDoc, SchemaDoc } from './db.js';

interface LoadedRunInputs {
  set: Api.components['schemas']['Set'];
  schemas: Api.components['schemas']['Schema'][];
  registry: CustomFunctionRegistry;
}

export class LoadFailure extends Error {
  override readonly name = 'LoadFailure';
}

export async function loadRunInputs(args: {
  db: WorkerDb;
  workspaceId: string;
  setId: string;
}): Promise<LoadedRunInputs> {
  const set = (await args.db.sets.findOne(
    { workspaceId: args.workspaceId, id: args.setId },
    { projection: { _id: 0 } },
  )) as SetDoc | null;
  if (!set) throw new LoadFailure(`Set ${args.setId} not found`);

  const schemas = (await args.db.schemas
    .find({ workspaceId: args.workspaceId }, { projection: { _id: 0 } })
    .toArray()) as SchemaDoc[];

  const fns = await args.db.customFunctions
    .find({ workspaceId: args.workspaceId }, { projection: { _id: 0 } })
    .toArray();

  const map = new Map<string, CustomFunctionEntry>();
  for (const f of fns) map.set(f.id, { source: f.source, usage: f.usage });
  const registry = customFunctionRegistryFromMap(map);

  return { set, schemas, registry };
}
```

- [ ] **Step 3: Write `apps/generation-worker/src/sandbox-singleton.ts`**

```ts
import { createSandboxPool, type SandboxPool } from '@mirage/sandbox';
import { env } from './env.js';

let pool: SandboxPool | null = null;

export function getSandbox(): SandboxPool {
  if (pool) return pool;
  pool = createSandboxPool({
    size: env.sandbox.poolSize,
    perCallTimeoutMs: env.sandbox.callTimeoutMs,
    memoryCapMb: env.sandbox.memoryCapMb,
  });
  return pool;
}

export async function shutdownSandbox(): Promise<void> {
  if (pool) {
    await pool.shutdown();
    pool = null;
  }
}
```

- [ ] **Step 4: Write `apps/generation-worker/src/cancel.ts`**

```ts
import type Redis from 'ioredis';
import { cancelFlagKey } from './queues.js';
import type { RunId } from '@mirage/types';

export async function isCancelled(redis: Redis, runId: RunId): Promise<boolean> {
  const value = await redis.get(cancelFlagKey(runId));
  return value === '1';
}
```

- [ ] **Step 5: Write `apps/generation-worker/src/s3.ts`**

```ts
import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';

export const s3 = new S3Client({
  endpoint: env.s3.endpoint,
  region: env.s3.region,
  credentials: { accessKeyId: env.s3.accessKey, secretAccessKey: env.s3.secretKey },
  forcePathStyle: env.s3.forcePathStyle,
});

export const runArtifactKey = (orgId: string, workspaceId: string, runId: string): string =>
  `org/${orgId}/workspace/${workspaceId}/run/${runId}.ndjson`;
```

- [ ] **Step 6: Write `apps/generation-worker/src/artifact-writer.ts`**

```ts
import { PassThrough } from 'node:stream';
import { Upload } from '@aws-sdk/lib-storage';
import type { S3Client } from '@aws-sdk/client-s3';
import { runArtifactKey } from './s3.js';

export class RunArtifactWriter {
  readonly key: string;
  private readonly stream = new PassThrough();
  private readonly upload: Upload;
  private finished = false;

  constructor(opts: {
    orgId: string;
    workspaceId: string;
    runId: string;
    s3Client: S3Client;
    bucket: string;
  }) {
    this.key = runArtifactKey(opts.orgId, opts.workspaceId, opts.runId);
    this.upload = new Upload({
      client: opts.s3Client,
      params: { Bucket: opts.bucket, Key: this.key, Body: this.stream, ContentType: 'application/x-ndjson' },
    });
  }

  async writeRow(row: unknown): Promise<void> {
    if (this.finished) throw new Error('writer is closed');
    const line = JSON.stringify(row) + '\n';
    const ok = this.stream.write(line);
    if (!ok) await new Promise<void>((resolve) => this.stream.once('drain', () => resolve()));
  }

  async close(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.stream.end();
    await this.upload.done();
  }

  async abort(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    try { await this.upload.abort(); } finally { this.stream.destroy(); }
  }
}
```

---

### Task 10: Rewrite the BullMQ processor

**Files:**
- Modify: `apps/generation-worker/src/processor.ts`

- [ ] **Step 1: Replace `apps/generation-worker/src/processor.ts`**

```ts
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import { runSet } from '@mirage/engine';
import type {
  RunCancelledEvent,
  RunCompletedEvent,
  RunEvent,
  RunFailedEvent,
  RunProgressEvent,
  RunStartedEvent,
  SchemaId,
} from '@mirage/types';
import { runChannel, type RunJobData } from './queues.js';
import type { WorkerDb } from './db.js';
import { loadRunInputs, LoadFailure } from './loaders.js';
import { getSandbox } from './sandbox-singleton.js';
import { isCancelled } from './cancel.js';
import { RunArtifactWriter } from './artifact-writer.js';
import { s3 } from './s3.js';
import { env } from './env.js';

const nowIso = (): string => new Date().toISOString();

class CancelledError extends Error {
  override readonly name = 'CancelledError';
}

export function makeRunProcessor(args: {
  publisher: Redis;
  cancelRedis: Redis;
  db: WorkerDb;
  logger: Logger;
}): (job: Job<RunJobData>) => Promise<void> {
  const { publisher, cancelRedis, db, logger } = args;

  const publish = async (event: RunEvent, orgId: RunJobData['orgId']): Promise<void> => {
    await publisher.publish(runChannel(orgId, event.runId), JSON.stringify(event));
  };

  return async (job: Job<RunJobData>): Promise<void> => {
    const { runId, setId, orgId, workspaceId } = job.data;
    const log = logger.child({ runId, setId });

    const startedAt = nowIso();
    await db.runs.updateOne({ id: runId }, { $set: { status: 'running', startedAt } });
    const startedEvent: RunStartedEvent = { type: 'run.started', runId, setId, at: startedAt };
    await publish(startedEvent, orgId);
    log.info('run started');

    let writer: RunArtifactWriter | null = null;

    try {
      if (await isCancelled(cancelRedis, runId)) throw new CancelledError();

      const { set, schemas, registry } = await loadRunInputs({ db, workspaceId, setId });
      const sandbox = getSandbox();

      const result = await runSet({ set, schemas, customFunctions: registry, sandbox });

      writer = new RunArtifactWriter({
        orgId,
        workspaceId,
        runId,
        s3Client: s3,
        bucket: env.s3.bucket,
      });

      const totalRows = set.schemas.reduce((acc, inc) => acc + inc.count, 0);
      let produced = 0;
      const rowCounts: Partial<Record<SchemaId, number>> = {};

      for (const [schemaKey, rows] of result.rowsByKey.entries()) {
        if (await isCancelled(cancelRedis, runId)) throw new CancelledError();
        for (const row of rows) {
          await writer.writeRow({ __schemaKey: schemaKey, ...(row as object) });
        }
        produced += rows.length;
        rowCounts[schemaKey as SchemaId] = rows.length;
        const progress: RunProgressEvent = {
          type: 'run.progress',
          runId,
          schemaId: schemaKey as SchemaId,
          produced,
          total: totalRows,
          at: nowIso(),
        };
        await publish(progress, orgId);
      }

      await writer.close();

      const endedAt = nowIso();
      await db.runs.updateOne(
        { id: runId },
        { $set: { status: 'completed', endedAt, artifactKey: writer.key, rowCounts } },
      );
      const completed: RunCompletedEvent = {
        type: 'run.completed',
        runId,
        artifactKey: writer.key,
        rowCounts,
        at: endedAt,
      };
      await publish(completed, orgId);
      log.info({ rowCounts }, 'run completed');
    } catch (err) {
      const endedAt = nowIso();
      if (err instanceof CancelledError) {
        if (writer) await writer.abort();
        await db.runs.updateOne({ id: runId }, { $set: { status: 'cancelled', endedAt } });
        const cancelled: RunCancelledEvent = { type: 'run.cancelled', runId, at: endedAt };
        await publish(cancelled, orgId);
        log.info('run cancelled');
        return;
      }
      if (writer) {
        try { await writer.abort(); } catch (abortErr) {
          log.warn({ err: abortErr }, 'failed to abort upload');
        }
      }
      const message = err instanceof LoadFailure
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
      await db.runs.updateOne(
        { id: runId },
        { $set: { status: 'failed', endedAt, errorMessage: message } },
      );
      const failed: RunFailedEvent = { type: 'run.failed', runId, message, at: endedAt };
      await publish(failed, orgId);
      log.warn({ err }, 'run failed');
      // Intentionally do NOT rethrow: BullMQ retry isn't in v1 scope.
    }
  };
}
```

---

### Task 11: Wire new processor deps into main.ts

**Files:**
- Modify: `apps/generation-worker/src/main.ts`

- [ ] **Step 1: Replace `apps/generation-worker/src/main.ts`**

```ts
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import { env } from './env.js';
import { makeRunProcessor } from './processor.js';
import { PREVIEWS_QUEUE, RUNS_QUEUE, type RunJobData } from './queues.js';
import { connectDb } from './db.js';
import { shutdownSandbox } from './sandbox-singleton.js';

const logger = pino({ level: env.logLevel });

async function main(): Promise<void> {
  const consumerOpts = { maxRetriesPerRequest: null } as const;

  const runsConnection = new IORedis(env.redisUrl, consumerOpts);
  const previewsConnection = new IORedis(env.redisUrl, consumerOpts);
  const publisher = new IORedis(env.redisUrl);
  const cancelRedis = new IORedis(env.redisUrl);

  const db = await connectDb();

  const processor = makeRunProcessor({ publisher, cancelRedis, db, logger });

  const runsWorker = new Worker<RunJobData>(
    RUNS_QUEUE,
    processor as (job: Job<RunJobData>) => Promise<unknown>,
    { connection: runsConnection, concurrency: env.runsConcurrency },
  );

  const previewsWorker = new Worker<RunJobData>(
    PREVIEWS_QUEUE,
    processor as (job: Job<RunJobData>) => Promise<unknown>,
    { connection: previewsConnection, concurrency: env.previewsConcurrency },
  );

  for (const w of [runsWorker, previewsWorker]) {
    w.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, queue: w.name, err: err.message }, 'job failed');
    });
    w.on('completed', (job) => {
      logger.info({ jobId: job.id, queue: w.name }, 'job completed');
    });
  }

  logger.info(
    {
      queues: [RUNS_QUEUE, PREVIEWS_QUEUE],
      runsConcurrency: env.runsConcurrency,
      previewsConcurrency: env.previewsConcurrency,
    },
    'generation-worker started',
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await Promise.all([runsWorker.close(), previewsWorker.close()]);
      await shutdownSandbox();
      await db.client.close();
      runsConnection.disconnect();
      previewsConnection.disconnect();
      publisher.disconnect();
      cancelRedis.disconnect();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'generation-worker failed to start');
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm nx run @mirage/generation-worker:typecheck`
Expected: clean.

---

## Phase 5 — Web SPA

### Task 12: WebSocket client singleton

**Files:**
- Create: `apps/web/src/api/ws.ts`

- [ ] **Step 1: Write the file**

```ts
import type { RunEvent } from '@mirage/types';
import { env } from '../env.js';

type Handler = (event: RunEvent) => void;

let socket: WebSocket | null = null;
let connectToken: string | null = null;
let connectOrg: string | null = null;
let connecting = false;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Map<string, Set<Handler>>();
const pendingSubscriptions = new Set<string>();

const BACKOFF_SECONDS = [1, 2, 4, 8, 16, 30];

function send(msg: object): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  if (!connectToken || !connectOrg) return;
  const delay = BACKOFF_SECONDS[Math.min(reconnectAttempt, BACKOFF_SECONDS.length - 1)] * 1000;
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, delay);
}

function openSocket(): void {
  if (connecting || !connectToken || !connectOrg) return;
  connecting = true;
  const base = env.bffUrl.replace(/^http/, 'ws');
  const url = `${base}/ws?token=${encodeURIComponent(connectToken)}&org=${encodeURIComponent(connectOrg)}`;
  const s = new WebSocket(url);
  socket = s;

  s.addEventListener('open', () => {
    connecting = false;
    reconnectAttempt = 0;
    for (const runId of pendingSubscriptions) send({ type: 'subscribe', runId });
  });
  s.addEventListener('message', (e: MessageEvent) => {
    let parsed: { type?: string } & Partial<RunEvent>;
    try {
      parsed = JSON.parse(typeof e.data === 'string' ? e.data : '');
    } catch { return; }
    if (!parsed.type || !parsed.type.startsWith('run.')) return;
    const event = parsed as RunEvent;
    const handlers = subscribers.get(event.runId);
    if (handlers) for (const h of handlers) h(event);
  });
  s.addEventListener('close', () => {
    connecting = false;
    socket = null;
    if (connectToken) scheduleReconnect();
  });
  s.addEventListener('error', () => { /* close handler triggers reconnect */ });
}

export const ws = {
  connect(token: string, orgId: string): void {
    connectToken = token;
    connectOrg = orgId;
    reconnectAttempt = 0;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (socket) { try { socket.close(); } catch { /* noop */ } socket = null; }
    openSocket();
  },
  subscribe(runId: string, handler: Handler): () => void {
    let set = subscribers.get(runId);
    if (!set) { set = new Set(); subscribers.set(runId, set); }
    set.add(handler);
    if (!pendingSubscriptions.has(runId)) {
      pendingSubscriptions.add(runId);
      send({ type: 'subscribe', runId });
    }
    return () => {
      const s = subscribers.get(runId);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) {
        subscribers.delete(runId);
        pendingSubscriptions.delete(runId);
        send({ type: 'unsubscribe', runId });
      }
    };
  },
  disconnect(): void {
    connectToken = null;
    connectOrg = null;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (socket) { try { socket.close(); } catch { /* noop */ } socket = null; }
    subscribers.clear();
    pendingSubscriptions.clear();
  },
};
```

---

### Task 13: Zustand `runs` slice

**Files:**
- Create: `apps/web/src/state/runs.ts`

Spec says `setRuns: Map<setId, RunState>`, but Zustand selectors don't track `Map` mutations. We use a plain record keyed by setId — same semantics, more idiomatic.

- [ ] **Step 1: Write the file**

```ts
import { create } from 'zustand';

export type RunPhase =
  | { phase: 'idle' }
  | { phase: 'starting'; runId: string }
  | { phase: 'running'; runId: string; produced: number; total: number; startedAt: string }
  | { phase: 'completed'; runId: string; rowCounts: Record<string, number>; endedAt: string; startedAt?: string }
  | { phase: 'failed'; runId: string; message: string }
  | { phase: 'cancelled'; runId: string };

interface RunsState {
  setRuns: Record<string, RunPhase>;
  setRunState: (setId: string, next: RunPhase) => void;
  clearRunState: (setId: string) => void;
}

export const useRunsStore = create<RunsState>((set) => ({
  setRuns: {},
  setRunState: (setId, next) => set((s) => ({ setRuns: { ...s.setRuns, [setId]: next } })),
  clearRunState: (setId) =>
    set((s) => {
      const { [setId]: _drop, ...rest } = s.setRuns;
      return { setRuns: rest };
    }),
}));
```

---

### Task 14: Shared RunStatusBadge

**Files:**
- Create: `apps/web/src/components/RunStatusBadge.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { cn } from '@mirage/ui-kit';
import type { Api } from '@mirage/types';

type Status = Api.components['schemas']['Run']['status'];

const LABEL: Record<Status, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const CLS: Record<Status, string> = {
  queued: 'bg-muted text-muted-foreground border-border',
  running: 'bg-amber-500/15 text-amber-700 border-amber-400/40 dark:text-amber-300',
  completed: 'bg-emerald-500/15 text-emerald-700 border-emerald-400/40 dark:text-emerald-300',
  failed: 'bg-destructive/15 text-destructive border-destructive/40',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

export function RunStatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-medium',
        CLS[status],
      )}
    >
      {LABEL[status]}
    </span>
  );
}
```

---

### Task 15: WsProvider + wire into main.tsx

**Files:**
- Create: `apps/web/src/components/WsProvider.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Write `apps/web/src/components/WsProvider.tsx`**

```tsx
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { useUiStore } from '../state/store.js';
import { ws } from '../api/ws.js';

export function WsProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const orgId = useUiStore((s) => s.currentOrgId);

  useEffect(() => {
    if (auth.status !== 'authenticated' || !auth.user?.access_token || !orgId) return;
    ws.connect(auth.user.access_token, orgId);
    return () => { ws.disconnect(); };
  }, [auth.status, auth.user?.access_token, orgId]);

  return <>{children}</>;
}
```

- [ ] **Step 2: Wrap React tree in `apps/web/src/main.tsx`**

Add import:

```ts
import { WsProvider } from './components/WsProvider.js';
```

Update the JSX inside `<AuthProvider>`:

```tsx
      <AuthProvider>
        <WsProvider>
          <BrowserRouter>
            <AppRouter />
          </BrowserRouter>
        </WsProvider>
      </AuthProvider>
```

---

### Task 16: RunControl component

**Files:**
- Create: `apps/web/src/pages/dashboard/sets/RunControl.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, X, RotateCcw } from 'lucide-react';
import type { Api, RunEvent } from '@mirage/types';
import { bff } from '../../../api/client.js';
import { ws } from '../../../api/ws.js';
import { useRunsStore, type RunPhase } from '../../../state/runs.js';
import { RunStatusBadge } from '../../../components/RunStatusBadge.js';

type Run = Api.components['schemas']['Run'];
type RunListItem = Api.components['schemas']['RunListItem'];

interface Props {
  wsId: string;
  setId: string;
  onCompleted?: () => void;
}

function deriveSeed(latest: RunListItem | undefined): RunPhase {
  if (!latest) return { phase: 'idle' };
  if (latest.status === 'completed') {
    return {
      phase: 'completed',
      runId: latest.id,
      rowCounts: (latest.rowCounts ?? {}) as Record<string, number>,
      endedAt: latest.endedAt ?? latest.createdAt,
      ...(latest.startedAt ? { startedAt: latest.startedAt } : {}),
    };
  }
  if (latest.status === 'queued') return { phase: 'starting', runId: latest.id };
  if (latest.status === 'running') {
    return {
      phase: 'running',
      runId: latest.id,
      produced: 0,
      total: 0,
      startedAt: latest.startedAt ?? latest.createdAt,
    };
  }
  if (latest.status === 'failed') {
    return { phase: 'failed', runId: latest.id, message: latest.errorMessage ?? 'Run failed' };
  }
  if (latest.status === 'cancelled') return { phase: 'cancelled', runId: latest.id };
  return { phase: 'idle' };
}

export function RunControl({ wsId, setId, onCompleted }: Props) {
  const queryClient = useQueryClient();
  const state = useRunsStore((s) => s.setRuns[setId] ?? { phase: 'idle' });
  const setRunState = useRunsStore((s) => s.setRunState);
  const completedFired = useRef<string | null>(null);

  useQuery({
    queryKey: ['runs', wsId, 'latest-for-set', setId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/runs', {
        params: { path: { wsId }, query: { setId, limit: 1 } },
      });
      if (error) throw error;
      const list = (data ?? []) as RunListItem[];
      const seed = deriveSeed(list[0]);
      const existing = useRunsStore.getState().setRuns[setId];
      if (!existing || existing.phase === 'idle') setRunState(setId, seed);
      return list[0] ?? null;
    },
    staleTime: 5_000,
  });

  const activeRunId = state.phase === 'starting' || state.phase === 'running'
    ? ('runId' in state ? state.runId : null)
    : null;

  useEffect(() => {
    if (!activeRunId) return;
    const off = ws.subscribe(activeRunId, (e: RunEvent) => {
      if (e.runId !== activeRunId) return;
      if (e.type === 'run.started') {
        setRunState(setId, { phase: 'running', runId: activeRunId, produced: 0, total: 0, startedAt: e.at });
      } else if (e.type === 'run.progress') {
        const current = useRunsStore.getState().setRuns[setId];
        const startedAt = current && current.phase === 'running' ? current.startedAt : e.at;
        setRunState(setId, {
          phase: 'running',
          runId: activeRunId,
          produced: e.produced,
          total: e.total,
          startedAt,
        });
      } else if (e.type === 'run.completed') {
        setRunState(setId, {
          phase: 'completed',
          runId: activeRunId,
          rowCounts: e.rowCounts as Record<string, number>,
          endedAt: e.at,
        });
      } else if (e.type === 'run.failed') {
        setRunState(setId, { phase: 'failed', runId: activeRunId, message: e.message });
      } else if (e.type === 'run.cancelled') {
        setRunState(setId, { phase: 'cancelled', runId: activeRunId });
      }
    });
    return off;
  }, [activeRunId, setId, setRunState]);

  useEffect(() => {
    if (state.phase === 'completed' && completedFired.current !== state.runId) {
      completedFired.current = state.runId;
      onCompleted?.();
      void queryClient.invalidateQueries({ queryKey: ['runs', wsId, 'latest-for-set', setId] });
      void queryClient.invalidateQueries({ queryKey: ['runs', wsId] });
    }
  }, [state, onCompleted, queryClient, wsId, setId]);

  const startRun = useMutation({
    mutationFn: async (): Promise<Run> => {
      const { data, error } = await bff.POST('/workspaces/{wsId}/sets/{id}/run', {
        params: { path: { wsId, id: setId } },
      });
      if (error) throw error;
      if (!data) throw new Error('Empty response');
      return data;
    },
    onSuccess: (run) => {
      setRunState(setId, { phase: 'starting', runId: run.id });
      void queryClient.invalidateQueries({ queryKey: ['runs', wsId, 'latest-for-set', setId] });
    },
  });

  const cancelRun = useMutation({
    mutationFn: async (runId: string): Promise<void> => {
      const { error } = await bff.POST('/workspaces/{wsId}/runs/{id}/cancel', {
        params: { path: { wsId, id: runId } },
      });
      if (error) throw error;
    },
  });

  if (state.phase === 'idle') {
    return (
      <button
        type="button"
        onClick={() => startRun.mutate()}
        disabled={startRun.isPending}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        <Play size={14} strokeWidth={2.5} /> Run set
      </button>
    );
  }

  if (state.phase === 'starting') {
    return (
      <div className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground" />
        Queued…
      </div>
    );
  }

  if (state.phase === 'running') {
    const pct = state.total > 0 ? Math.min(100, Math.round((state.produced / state.total) * 100)) : 0;
    return (
      <div className="inline-flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-44 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {state.produced.toLocaleString()} / {state.total.toLocaleString()} rows
          </span>
        </div>
        <button
          type="button"
          onClick={() => cancelRun.mutate(state.runId)}
          disabled={cancelRun.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium text-foreground hover:bg-accent disabled:opacity-60"
        >
          <X size={14} /> Cancel
        </button>
      </div>
    );
  }

  if (state.phase === 'completed') {
    return (
      <div className="inline-flex items-center gap-2">
        <RunStatusBadge status="completed" />
        <button
          type="button"
          onClick={() => startRun.mutate()}
          disabled={startRun.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium text-foreground hover:bg-accent"
        >
          <RotateCcw size={13} /> Run again
        </button>
      </div>
    );
  }

  if (state.phase === 'failed') {
    return (
      <div className="inline-flex items-center gap-2">
        <RunStatusBadge status="failed" />
        <span className="max-w-[280px] truncate text-[12px] text-destructive" title={state.message}>
          {state.message}
        </span>
        <button
          type="button"
          onClick={() => startRun.mutate()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium text-foreground hover:bg-accent"
        >
          <RotateCcw size={13} /> Retry
        </button>
      </div>
    );
  }

  // cancelled
  return (
    <div className="inline-flex items-center gap-2">
      <RunStatusBadge status="cancelled" />
      <button
        type="button"
        onClick={() => startRun.mutate()}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium text-foreground hover:bg-accent"
      >
        <RotateCcw size={13} /> Run again
      </button>
    </div>
  );
}
```

---

### Task 17: Wire RunControl + PreviewTab props into DetailPane

**Files:**
- Modify: `apps/web/src/pages/dashboard/sets/DetailPane.tsx`

- [ ] **Step 1: Add import**

Add near the other imports:

```ts
import { RunControl } from './RunControl.js';
```

- [ ] **Step 2: Replace the disabled Run button block at lines 150-157**

Replace the entire `<button type="button" disabled title="Generation pipeline coming soon">…<Play/> Run set</button>` block with:

```tsx
          <RunControl wsId={wsId} setId={set.id} onCompleted={() => setTab('preview')} />
```

If `Play` is no longer used elsewhere in the file, remove it from the `lucide-react` import.

- [ ] **Step 3: Pass props to `<PreviewTab />`**

Find the line `{tab === 'preview' && <PreviewTab />}` (or equivalent) and change to:

```tsx
        {tab === 'preview' && <PreviewTab wsId={wsId} set={set} />}
```

---

### Task 18: PreviewTab rewrite

**Files:**
- Modify: `apps/web/src/pages/dashboard/sets/PreviewTab.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Api } from '@mirage/types';
import { bff } from '../../../api/client.js';
import { RunStatusBadge } from '../../../components/RunStatusBadge.js';
import type { MirageSet } from './lib/types.js';

type RunListItem = Api.components['schemas']['RunListItem'];
type RunPreviewPage = Api.components['schemas']['RunPreviewPage'];

interface Props {
  wsId: string;
  set: MirageSet;
}

const PAGE_SIZE = 200;

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function PreviewTab({ wsId, set }: Props) {
  const latestQuery = useQuery({
    queryKey: ['runs', wsId, 'latest-for-set', set.id],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/runs', {
        params: { path: { wsId }, query: { setId: set.id, limit: 1 } },
      });
      if (error) throw error;
      return ((data ?? []) as RunListItem[])[0] ?? null;
    },
    refetchInterval: (query) => {
      const r = query.state.data as RunListItem | null | undefined;
      return r && (r.status === 'queued' || r.status === 'running') ? 1500 : false;
    },
  });

  const run = latestQuery.data ?? null;
  const schemaKeys = useMemo(() => Object.keys(run?.rowCounts ?? {}), [run]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!activeKey && schemaKeys.length > 0) setActiveKey(schemaKeys[0]!);
  }, [activeKey, schemaKeys]);

  useEffect(() => { setOffset(0); }, [activeKey]);

  const previewQuery = useQuery({
    enabled: !!run && run.status === 'completed' && !!activeKey,
    queryKey: ['run-preview', wsId, run?.id, activeKey, offset],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/runs/{id}/preview', {
        params: {
          path: { wsId, id: run!.id },
          query: { schemaKey: activeKey!, offset, limit: PAGE_SIZE },
        },
      });
      if (error) throw error;
      return data as RunPreviewPage;
    },
  });

  if (!run || run.status !== 'completed') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Sparkles size={26} strokeWidth={1.5} />
        </span>
        <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">
          Preview rows after a run
        </h3>
        <p className="max-w-md text-[13px] text-muted-foreground">
          Click <b>Run set</b> above. When the run completes, rows will appear here.
        </p>
      </div>
    );
  }

  const totalRows = Object.values(run.rowCounts ?? {}).reduce((a, b) => a + b, 0);
  const duration = run.startedAt && run.endedAt
    ? `${Math.round((new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()) / 100) / 10}s`
    : '—';

  const rows = previewQuery.data?.rows ?? [];
  const total = previewQuery.data?.total ?? run.rowCounts?.[activeKey ?? ''] ?? 0;
  const columns = ((): string[] => {
    const keys = new Set<string>();
    for (const r of rows.slice(0, 10)) {
      if (r && typeof r === 'object') {
        for (const k of Object.keys(r as object)) {
          if (k !== '__schemaKey' && k !== '__id') keys.add(k);
        }
      }
    }
    return [...keys];
  })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center gap-4 border-b border-border px-8 py-3">
        <RunStatusBadge status={run.status} />
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="font-mono">salt: {set.salt}</span>
          <span>·</span>
          <span>{totalRows.toLocaleString()} rows</span>
          <span>·</span>
          <span>{duration}</span>
        </div>
      </div>

      <nav className="flex flex-none items-center gap-1 border-b border-border px-8">
        {schemaKeys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setActiveKey(k)}
            className={`px-3 py-2 text-[12.5px] ${k === activeKey ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {k} <span className="ml-1 text-muted-foreground">({(run.rowCounts?.[k] ?? 0).toLocaleString()})</span>
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-auto px-8 py-4">
        {previewQuery.isLoading ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No rows.</p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {columns.map((c) => (
                  <th key={c} className="px-2 py-1 font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/50">
                  {columns.map((c) => (
                    <td key={c} className="px-2 py-1 font-mono">
                      {formatCell((r as Record<string, unknown>)[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-none items-center justify-between border-t border-border px-8 py-2 text-[12px] text-muted-foreground">
        <span>
          {rows.length === 0
            ? '0 rows'
            : `${(offset + 1).toLocaleString()}–${(offset + rows.length).toLocaleString()} of ${total.toLocaleString()}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={offset <= 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 hover:bg-accent disabled:opacity-50"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <button
            type="button"
            disabled={offset + rows.length >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 hover:bg-accent disabled:opacity-50"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note: the **Download** button is intentionally omitted for sub-project 4. Export-svc isn't proxied through the BFF yet, and the spec's "Out of scope" section excludes export wiring. A follow-up task will add the proxy + button.

---

### Task 19: HistoryPage rewrite

**Files:**
- Modify: `apps/web/src/pages/dashboard/HistoryPage.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Api } from '@mirage/types';
import { bff } from '../../api/client.js';
import { PageHeader } from '../../components/shell/PageHeader.js';
import { EmptyStub } from '../../components/shell/EmptyStub.js';
import { RunStatusBadge } from '../../components/RunStatusBadge.js';

type RunListItem = Api.components['schemas']['RunListItem'];
type Status = Api.components['schemas']['Run']['status'];

const PAGE_SIZE = 50;
const STATUSES: Array<Status | 'all'> = ['all', 'queued', 'running', 'completed', 'failed', 'cancelled'];

export function HistoryPage() {
  const { wsId = '' } = useParams<{ wsId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [setIdFilter, setSetIdFilter] = useState<string>('');
  const [offset, setOffset] = useState(0);

  const setsQuery = useQuery({
    enabled: !!wsId,
    queryKey: ['sets', wsId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/sets', {
        params: { path: { wsId } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const runsQuery = useQuery({
    enabled: !!wsId,
    queryKey: ['runs', wsId, status, setIdFilter, offset],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/runs', {
        params: {
          path: { wsId },
          query: {
            limit: PAGE_SIZE,
            offset,
            ...(status !== 'all' ? { status } : {}),
            ...(setIdFilter ? { setId: setIdFilter } : {}),
          },
        },
      });
      if (error) throw error;
      return (data ?? []) as RunListItem[];
    },
  });

  const runs = runsQuery.data ?? [];
  const setsBySetId = new Map((setsQuery.data ?? []).map((s) => [s.id, s]));

  if (!runsQuery.isLoading && runs.length === 0 && offset === 0 && status === 'all' && !setIdFilter) {
    return (
      <>
        <PageHeader title="Run history" subtitle="Past generation runs and their outputs." />
        <EmptyStub icon={History} title="No runs yet" />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Run history" subtitle="Past generation runs and their outputs." />

      <div className="flex items-center gap-3 px-8 py-3">
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Status
          <select
            value={status}
            onChange={(e) => { setOffset(0); setStatus(e.target.value as Status | 'all'); }}
            className="h-8 rounded-md border border-input bg-background px-2 text-[12.5px]"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Set
          <select
            value={setIdFilter}
            onChange={(e) => { setOffset(0); setSetIdFilter(e.target.value); }}
            className="h-8 rounded-md border border-input bg-background px-2 text-[12.5px]"
          >
            <option value="">All sets</option>
            {(setsQuery.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-auto px-8">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Run id</th>
              <th className="px-2 py-2 font-medium">Set</th>
              <th className="px-2 py-2 font-medium">Kind</th>
              <th className="px-2 py-2 font-medium">Started</th>
              <th className="px-2 py-2 font-medium">Duration</th>
              <th className="px-2 py-2 font-medium">Total rows</th>
              <th className="px-2 py-2 font-medium">Requested by</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const totalRows = Object.values(r.rowCounts ?? {}).reduce((a, b) => a + b, 0);
              const duration = r.startedAt && r.endedAt
                ? `${Math.round((new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 100) / 10}s`
                : '—';
              return (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/workspaces/${wsId}/sets?active=${r.setId}`)}
                  className="cursor-pointer border-b border-border/50 hover:bg-accent"
                >
                  <td className="px-2 py-1.5"><RunStatusBadge status={r.status} /></td>
                  <td className="px-2 py-1.5 font-mono">{r.id}</td>
                  <td className="px-2 py-1.5">{setsBySetId.get(r.setId)?.name ?? r.setId}</td>
                  <td className="px-2 py-1.5">{r.kind}</td>
                  <td className="px-2 py-1.5">{r.startedAt ? new Date(r.startedAt).toLocaleString() : '—'}</td>
                  <td className="px-2 py-1.5">{duration}</td>
                  <td className="px-2 py-1.5">{totalRows.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.requestedBy}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 px-8 py-3 text-[12px] text-muted-foreground">
        <button
          type="button"
          disabled={offset <= 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 hover:bg-accent disabled:opacity-50"
        >
          <ChevronLeft size={12} /> Prev
        </button>
        <button
          type="button"
          disabled={runs.length < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 hover:bg-accent disabled:opacity-50"
        >
          Next <ChevronRight size={12} />
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck the SPA**

Run: `pnpm nx run @mirage/web:typecheck`
Expected: clean.

---

## Phase 6 — Full verification

### Task 20: Full typecheck + manual smoke

- [ ] **Step 1: Typecheck everything**

Run: `pnpm typecheck`
Expected: every project clean.

- [ ] **Step 2: Boot the dev stack**

Run: `docker compose up -d` (brings up Mongo, Redis, MinIO, Keycloak).
Then: `pnpm dev`.
Expected: BFF :4000, workspace-svc :4001, generation-worker logs "generation-worker started", web :5173.

- [ ] **Step 3: Sign in + open a Set**

Open http://localhost:5173, sign in, navigate to a workspace, open or create a Set with ≥1 Schema and ≥10 rows.

- [ ] **Step 4: Click Run set, watch progress**

- Header shows Queued → progress bar → Completed badge.
- DevTools network panel: WS to `/ws?token=...&org=...`, `subscribe` outbound, `run.started`, `run.progress` x N, `run.completed` inbound.
- Preview tab activates automatically on completion.

- [ ] **Step 5: Preview tab**

- Switch schema tabs; rows render.
- Prev/Next pagination works.

- [ ] **Step 6: Artifact eviction**

- Click Run set again; verify in MinIO console (http://localhost:9001) that only the new `.ndjson` is present.

- [ ] **Step 7: Cancel**

- Start a run with a large row count. Click Cancel before completion. UI lands on Cancelled. Mongo `runs.status === 'cancelled'`, no `artifactKey`.

- [ ] **Step 8: HistoryPage**

- Navigate to `/workspaces/:wsId/history`. See the recent runs. Apply filters. Click a row → navigates to that Set.

---

## Notes & known limitations (documented in spec, surfaced here)

- **Engine still buffers `rowsByKey` in memory** — the writer streams to S3, but the engine isn't a generator yet. Large runs use proportional RAM. Follow-up listed in spec.
- **Progress events fire per-Schema only** — no per-500-row granularity in v1.
- **`run.progress.schemaId` field carries the schemaKey** — the existing `RunProgressEvent` types `schemaId: SchemaId`, but the spec speaks in `schemaKey`. `Brand<string, 'SchemaId'>` is structurally a string, so the processor casts via `as SchemaId`. Acceptable for v1; rename to `schemaKey` in a follow-up.
- **Download button**: deferred to a follow-up (export-svc isn't BFF-proxied yet). Spec marks export wiring as out of scope for sub-project 4.
- **WS auth via `?org=` query param**: trusted from the client per the spec note "BFF trusts that the user knows their own runIds". A future hardening would derive `orgId` from the verified JWT claims and disallow subscribing outside that set.
