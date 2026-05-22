# Workspace Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commit policy (project-specific):** The repo owner has a strict "no auto-commit" rule. Do **not** run `git commit` automatically. At each "Commit" step, **stage** changes with `git add` and pause for explicit approval before committing.

**Goal:** Allow an org owner to delete a workspace, hiding it immediately with a "Deleting…" state and cascading destruction of every Mongo doc owned by it plus every S3 object under its prefix.

**Architecture:** Two-phase delete. The `DELETE /workspaces/:id` endpoint sets `deletedAt`, cancels in-flight runs, and enqueues an in-process cascade. The cascade drains runs, purges S3 keys under `org/{orgId}/workspace/{wsId}/`, then deletes Mongo docs in dependency order. A startup sweep re-runs cascades for any workspace left in `deletedAt` state across restarts.

**Tech Stack:** TypeScript, Fastify, MongoDB (`mongodb` driver), BullMQ on Redis, AWS SDK v3 (`@aws-sdk/client-s3`), React 18 + TanStack Query, openapi-fetch.

**Spec:** [docs/superpowers/specs/2026-05-22-workspace-delete-design.md](../specs/2026-05-22-workspace-delete-design.md)

---

## File Plan

### `packages/types/`
- **Modify** `openapi.yaml` — add `deletedAt` to `Workspace` schema; add `DELETE /workspaces/{id}` operation.
- **Modify** `src/workspace.ts` — add optional `deletedAt` field.
- **Regenerate** `src/openapi.generated.ts` via `pnpm gen:openapi`.

### `apps/workspace-svc/`
- **Create** `src/workspace-cascade.ts` — in-process cascade module (drain → S3 purge → Mongo purge → idempotent).
- **Create** `src/__tests__/workspace-cascade.test.ts` — Vitest tests for cascade idempotency and ordering against in-memory fakes.
- **Modify** `src/routes/workspaces.ts` — add `DELETE /workspaces/:id`; filter list/get to expose `deletedAt`.
- **Modify** `src/routes/schemas.ts` — `resolveWorkspace` rejects soft-deleted workspaces.
- **Modify** `src/routes/sets.ts` — same.
- **Modify** `src/routes/runs.ts` — same.
- **Modify** `src/routes/custom-functions.ts` — same.
- **Modify** `src/server.ts` — construct cascade, wire it into routes, run startup sweep.

### `apps/bff/`
- **Modify** `src/routes/workspaces.ts` — forward `DELETE /workspaces/:id` to workspace-svc.

### `apps/web/`
- **Modify** `src/components/workspace-picker/WorkspaceRow.tsx` — render greyed-out / unclickable state when `deletedAt` is set.
- **Modify** `src/components/workspace-picker/WorkspaceList.tsx` — when selecting, skip rows with `deletedAt`.
- **Create** `src/components/workspace-picker/DeleteWorkspaceModal.tsx` — confirm modal.
- **Modify** `src/components/workspace-picker/WorkspaceDetailCard.tsx` — add danger-zone delete button + wiring.
- **Modify** `src/pages/workspaces/WorkspacesPage.tsx` — auto-select skips deleted; poll while any row is `deletedAt`; navigate away if active ws gets deleted.
- **Modify** `src/components/shell/WorkspaceSwitcher.tsx` — filter out workspaces with `deletedAt`.

---

## Task 1: Add `deletedAt` to OpenAPI and Workspace type

**Files:**
- Modify: `packages/types/openapi.yaml`
- Modify: `packages/types/src/workspace.ts`
- Regenerate: `packages/types/src/openapi.generated.ts`

- [ ] **Step 1: Add `deletedAt` to the `Workspace` schema in `packages/types/openapi.yaml`**

Find this block (around line 608):

```yaml
    Workspace:
      type: object
      required: [id, orgId, name, createdBy, createdAt, updatedAt]
      additionalProperties: false
      properties:
        id: { type: string }
        orgId: { type: string }
        name: { type: string, minLength: 1, maxLength: 80 }
        description: { type: string, maxLength: 500 }
        createdBy: { type: string }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
```

Replace with:

```yaml
    Workspace:
      type: object
      required: [id, orgId, name, createdBy, createdAt, updatedAt]
      additionalProperties: false
      properties:
        id: { type: string }
        orgId: { type: string }
        name: { type: string, minLength: 1, maxLength: 80 }
        description: { type: string, maxLength: 500 }
        createdBy: { type: string }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
        deletedAt:
          type: string
          format: date-time
          description: |
            Set when the workspace is soft-deleted. While present, the row is
            still returned by list/get but every sub-resource endpoint
            responds 404. The row is hard-deleted (removed entirely) once the
            background cascade finishes.
```

- [ ] **Step 2: Add the `DELETE /workspaces/{id}` operation**

Find the `/workspaces/{id}:` block (around line 87) and append a `delete:` operation after the existing `get:`:

```yaml
  /workspaces/{id}:
    parameters:
      - in: path
        name: id
        required: true
        schema: { type: string }
    get:
      summary: Get a Workspace by id
      operationId: getWorkspace
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Workspace'
        '404':
          $ref: '#/components/responses/NotFound'
    delete:
      summary: Delete a Workspace (cascade)
      description: |
        Soft-deletes the workspace immediately (sets `deletedAt`) and starts
        an async cascade that cancels in-flight runs, purges every S3 object
        under `org/{orgId}/workspace/{wsId}/`, and deletes every Mongo doc
        scoped to this workspace. Caller must be an org owner.
      operationId: deleteWorkspace
      responses:
        '202':
          description: Accepted — soft delete written; cascade in progress
          content:
            application/json:
              schema:
                type: object
                required: [id, deletedAt]
                additionalProperties: false
                properties:
                  id: { type: string }
                  deletedAt: { type: string, format: date-time }
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '409':
          description: Workspace is already being deleted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
```

- [ ] **Step 3: Add `deletedAt` to the `Workspace` TS interface**

In [packages/types/src/workspace.ts](../../packages/types/src/workspace.ts), replace the interface with:

```ts
import type { OrgId, UserId, WorkspaceId } from './branded.js';

/**
 * A Workspace is the top-level container that holds all of one project's
 * Schemas, Sets, and Custom Functions. A user can own many Workspaces, but
 * cross-workspace references are not permitted. See CONTEXT.md.
 */
export interface Workspace {
  id: WorkspaceId;
  orgId: OrgId;
  name: string;
  description?: string;
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
  /**
   * Set when the workspace is soft-deleted; absent (and the row removed
   * from Mongo entirely) once the cascade completes.
   */
  deletedAt?: string;
}
```

- [ ] **Step 4: Regenerate the OpenAPI client types**

Run from the repo root:

```bash
pnpm gen:openapi
```

Expected: writes `packages/types/src/openapi.generated.ts` with a new `deleteWorkspace` operation under `paths['/workspaces/{id}']` and `deletedAt?: string` on the `Workspace` schema. No errors.

- [ ] **Step 5: Typecheck the types package**

```bash
pnpm --filter @mirage/types exec tsc -p tsconfig.json --noEmit
```

Expected: no output (success).

- [ ] **Step 6: Stage**

```bash
git add packages/types/openapi.yaml packages/types/src/workspace.ts packages/types/src/openapi.generated.ts
```

Pause for explicit user approval before `git commit`.

---

## Task 2: Build the in-process cascade module (logic only, no I/O)

This task creates the cascade as a pure-logic state machine driven by injected I/O ports. That makes it testable without spinning up Mongo / S3 / Redis. Task 3 adds the test. Task 4 wires the real I/O in.

**Files:**
- Create: `apps/workspace-svc/src/workspace-cascade.ts`

- [ ] **Step 1: Create the module**

Create [apps/workspace-svc/src/workspace-cascade.ts](../../apps/workspace-svc/src/workspace-cascade.ts):

```ts
import type { FastifyBaseLogger } from 'fastify';
import type { WorkspaceId } from '@mirage/types';

/**
 * Ports the cascade calls. Real implementations live in workspace-svc/server.ts;
 * tests inject in-memory fakes.
 */
export interface CascadePorts {
  /** Count of runs in non-terminal states (`queued`, `running`, `cancelling`). */
  countActiveRuns(workspaceId: WorkspaceId): Promise<number>;
  /** Delete every S3 object under `org/{orgId}/workspace/{wsId}/`. Idempotent. */
  purgeS3Prefix(orgId: string, workspaceId: WorkspaceId): Promise<void>;
  /** Run `deleteMany` against each workspace-scoped collection, in dependency order. */
  purgeMongo(workspaceId: WorkspaceId): Promise<void>;
  /** Look up `(orgId, deletedAt)` for a soft-deleted workspace, or null if gone. */
  lookupSoftDeleted(
    workspaceId: WorkspaceId,
  ): Promise<{ orgId: string } | null>;
  /** Find every workspace currently in `deletedAt` state. Used by the startup sweep. */
  listSoftDeleted(): Promise<WorkspaceId[]>;
}

export interface CascadeOptions {
  /** Max wall-clock seconds to wait for runs to drain. Default 120. */
  drainTimeoutSec?: number;
  /** Poll interval (ms) while waiting for runs to drain. Default 1000. */
  drainPollMs?: number;
  log: FastifyBaseLogger;
  ports: CascadePorts;
}

export interface WorkspaceCascade {
  enqueue(workspaceId: WorkspaceId): void;
  runStartupSweep(): Promise<void>;
  /** Test hook — resolves after every in-flight cascade has finished. */
  waitIdle(): Promise<void>;
}

export function createWorkspaceCascade(opts: CascadeOptions): WorkspaceCascade {
  const drainTimeoutMs = (opts.drainTimeoutSec ?? 120) * 1000;
  const pollMs = opts.drainPollMs ?? 1000;
  const log = opts.log;
  const ports = opts.ports;

  /** Track which workspaces are currently being cascaded so a re-enqueue is a no-op. */
  const inflight = new Map<WorkspaceId, Promise<void>>();

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const drain = async (workspaceId: WorkspaceId): Promise<void> => {
    const deadline = Date.now() + drainTimeoutMs;
    while (Date.now() < deadline) {
      const n = await ports.countActiveRuns(workspaceId);
      if (n === 0) return;
      log.info({ workspaceId, active: n }, 'workspace-cascade: waiting for runs to drain');
      await sleep(pollMs);
    }
    log.warn({ workspaceId }, 'workspace-cascade: drain timeout, proceeding regardless');
  };

  const cascade = async (workspaceId: WorkspaceId): Promise<void> => {
    log.info({ workspaceId }, 'workspace-cascade: starting');
    const found = await ports.lookupSoftDeleted(workspaceId);
    if (!found) {
      log.info({ workspaceId }, 'workspace-cascade: nothing to do (already gone)');
      return;
    }
    await drain(workspaceId);
    log.info({ workspaceId }, 'workspace-cascade: purging S3');
    await ports.purgeS3Prefix(found.orgId, workspaceId);
    log.info({ workspaceId }, 'workspace-cascade: purging Mongo');
    await ports.purgeMongo(workspaceId);
    log.info({ workspaceId }, 'workspace-cascade: done');
  };

  const enqueue = (workspaceId: WorkspaceId): void => {
    if (inflight.has(workspaceId)) return;
    const p = cascade(workspaceId)
      .catch((err: unknown) => {
        log.error({ err, workspaceId }, 'workspace-cascade: failed');
      })
      .finally(() => {
        inflight.delete(workspaceId);
      });
    inflight.set(workspaceId, p);
  };

  const runStartupSweep = async (): Promise<void> => {
    const ids = await ports.listSoftDeleted();
    log.info({ count: ids.length }, 'workspace-cascade: startup sweep');
    for (const id of ids) enqueue(id);
  };

  const waitIdle = async (): Promise<void> => {
    while (inflight.size > 0) {
      await Promise.allSettled([...inflight.values()]);
    }
  };

  return { enqueue, runStartupSweep, waitIdle };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/workspace-svc exec tsc -p tsconfig.json --noEmit
```

Expected: no output (success).

- [ ] **Step 3: Stage**

```bash
git add apps/workspace-svc/src/workspace-cascade.ts
```

Pause for explicit user approval before `git commit`.

---

## Task 3: Test the cascade

**Files:**
- Create: `apps/workspace-svc/src/__tests__/workspace-cascade.test.ts`

- [ ] **Step 1: Write the failing test**

Create [apps/workspace-svc/src/__tests__/workspace-cascade.test.ts](../../apps/workspace-svc/src/__tests__/workspace-cascade.test.ts):

```ts
import { describe, it, expect } from 'vitest';
import { asId, type WorkspaceId } from '@mirage/types';
import { createWorkspaceCascade, type CascadePorts } from '../workspace-cascade.js';

/** A no-op pino-shaped logger so the cascade can call log.info/warn/error. */
const noopLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => noopLog,
  level: 'info',
} as unknown as Parameters<typeof createWorkspaceCascade>[0]['log'];

function makePorts(overrides: Partial<CascadePorts> = {}): CascadePorts & {
  calls: string[];
} {
  const calls: string[] = [];
  const base: CascadePorts = {
    async countActiveRuns() { calls.push('count'); return 0; },
    async purgeS3Prefix(orgId, wsId) { calls.push(`s3:${orgId}/${wsId}`); },
    async purgeMongo(wsId) { calls.push(`mongo:${wsId}`); },
    async lookupSoftDeleted(wsId) { return { orgId: `org-of-${wsId}` }; },
    async listSoftDeleted() { return []; },
    ...overrides,
  };
  return Object.assign(base, { calls });
}

const WS = asId<WorkspaceId>('ws_test');

describe('workspace-cascade', () => {
  it('runs drain → s3 → mongo in order when there are no active runs', async () => {
    const ports = makePorts();
    const cascade = createWorkspaceCascade({ log: noopLog, ports, drainPollMs: 1 });
    cascade.enqueue(WS);
    await cascade.waitIdle();
    expect(ports.calls).toEqual(['count', `s3:org-of-${WS}/${WS}`, `mongo:${WS}`]);
  });

  it('is a no-op when the workspace is not soft-deleted', async () => {
    const ports = makePorts({ async lookupSoftDeleted() { return null; } });
    const cascade = createWorkspaceCascade({ log: noopLog, ports, drainPollMs: 1 });
    cascade.enqueue(WS);
    await cascade.waitIdle();
    expect(ports.calls).toEqual([]);
  });

  it('coalesces a re-enqueue while a cascade is in flight', async () => {
    let resolveDrain: (() => void) | null = null;
    const ports = makePorts({
      async countActiveRuns() {
        // First call blocks until we let it through; subsequent calls return 0.
        return new Promise<number>((resolve) => {
          if (resolveDrain) {
            resolve(0);
          } else {
            resolveDrain = () => resolve(0);
          }
        });
      },
    });
    const cascade = createWorkspaceCascade({ log: noopLog, ports, drainPollMs: 1 });
    cascade.enqueue(WS);
    cascade.enqueue(WS); // should be a no-op
    cascade.enqueue(WS); // also a no-op
    resolveDrain!();
    await cascade.waitIdle();
    // Only one s3 and one mongo call despite three enqueues.
    expect(ports.calls.filter((c) => c.startsWith('s3:')).length).toBe(1);
    expect(ports.calls.filter((c) => c.startsWith('mongo:')).length).toBe(1);
  });

  it('polls drain until count reaches zero, then proceeds', async () => {
    let remaining = 3;
    const ports = makePorts({
      async countActiveRuns() { return remaining-- > 0 ? remaining + 1 : 0; },
    });
    const cascade = createWorkspaceCascade({ log: noopLog, ports, drainPollMs: 1 });
    cascade.enqueue(WS);
    await cascade.waitIdle();
    expect(ports.calls.filter((c) => c === 'count').length).toBeGreaterThanOrEqual(3);
    expect(ports.calls.filter((c) => c.startsWith('s3:')).length).toBe(1);
    expect(ports.calls.filter((c) => c.startsWith('mongo:')).length).toBe(1);
  });

  it('force-proceeds after drain timeout if runs never drain', async () => {
    const ports = makePorts({ async countActiveRuns() { return 5; } });
    const cascade = createWorkspaceCascade({
      log: noopLog,
      ports,
      drainPollMs: 1,
      drainTimeoutSec: 0, // immediate timeout
    });
    cascade.enqueue(WS);
    await cascade.waitIdle();
    expect(ports.calls.filter((c) => c.startsWith('s3:')).length).toBe(1);
    expect(ports.calls.filter((c) => c.startsWith('mongo:')).length).toBe(1);
  });

  it('runStartupSweep enqueues every soft-deleted workspace', async () => {
    const a = asId<WorkspaceId>('ws_a');
    const b = asId<WorkspaceId>('ws_b');
    const ports = makePorts({ async listSoftDeleted() { return [a, b]; } });
    const cascade = createWorkspaceCascade({ log: noopLog, ports, drainPollMs: 1 });
    await cascade.runStartupSweep();
    await cascade.waitIdle();
    expect(ports.calls.filter((c) => c.startsWith('mongo:'))).toEqual([
      `mongo:${a}`,
      `mongo:${b}`,
    ]);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @mirage/workspace-svc test -- workspace-cascade
```

Expected: all 6 tests pass.

- [ ] **Step 3: Stage**

```bash
git add apps/workspace-svc/src/__tests__/workspace-cascade.test.ts
```

Pause for explicit user approval before `git commit`.

---

## Task 4: Wire real I/O ports into the cascade

This task implements the four ports against real Mongo / S3 / BullMQ and constructs the cascade in `server.ts`. Routes don't use it yet — that comes in Task 5.

**Files:**
- Modify: `apps/workspace-svc/src/server.ts`

- [ ] **Step 1: Add the imports and cascade construction in `server.ts`**

In [apps/workspace-svc/src/server.ts](../../apps/workspace-svc/src/server.ts), replace the file with:

```ts
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
          status: { $in: ['queued', 'running', 'cancelling'] },
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
          const keys: ObjectIdentifier[] = (list.Contents ?? [])
            .map((c) => (c.Key ? { Key: c.Key } : null))
            .filter((k): k is ObjectIdentifier => k !== null);
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
        // Order: leaves first, then the workspace row itself. Each call is
        // idempotent (deleteMany on no matches is a no-op).
        await database.runs.deleteMany({ workspaceId });
        await database.customFunctions.deleteMany({ workspaceId });
        await database.sets.deleteMany({ workspaceId });
        await database.schemas.deleteMany({ workspaceId });
        // Only matches workspace-scoped membership overrides; org-level rows
        // have no `workspaceId` field and are untouched.
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

  // Recover from any prior crash mid-cascade.
  void cascade.runStartupSweep();

  return Object.assign(app, { cascade });
}
```

Note: `registerWorkspaceRoutes` now takes a third arg. We update it in Task 5. Until then `tsc` will fail on this file — that's intentional: the next task fixes the route signature.

- [ ] **Step 2: Don't typecheck yet** — Task 5 fixes the compile error introduced here. Continue.

- [ ] **Step 3: Stage**

```bash
git add apps/workspace-svc/src/server.ts
```

Pause for explicit user approval before `git commit`. (You may prefer to wait until Task 5 has compiled before committing — that's fine, just stage now and commit later.)

---

## Task 5: Add `DELETE /workspaces/:id` route and expose `deletedAt` on list/get

**Files:**
- Modify: `apps/workspace-svc/src/routes/workspaces.ts`

- [ ] **Step 1: Replace the file**

Replace [apps/workspace-svc/src/routes/workspaces.ts](../../apps/workspace-svc/src/routes/workspaces.ts) with:

```ts
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
    if (auth.role !== 'owner') {
      return reply.code(403).send({ error: 'only org owners can delete a workspace' });
    }

    const id = asId<WorkspaceId>(request.params.id);
    const ws = await db.workspaces.findOne({ orgId: auth.orgId, id });
    if (!ws) return reply.code(404).send({ error: 'not found' });
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
        { workspaceId: id, status: { $in: ['queued', 'running', 'cancelling'] } },
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
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/workspace-svc exec tsc -p tsconfig.json --noEmit
```

Expected: no output (success). Both this task and the changes from Task 4 should compile cleanly now.

- [ ] **Step 3: Stage**

```bash
git add apps/workspace-svc/src/routes/workspaces.ts
```

Pause for explicit user approval before `git commit`.

---

## Task 6: Reject soft-deleted workspaces in every resource resolver

There are four copies of `resolveWorkspace` — one per route file. Each needs the same one-line addition: after the not-found check, also reject if `ws.deletedAt` is set.

**Files:**
- Modify: `apps/workspace-svc/src/routes/schemas.ts`
- Modify: `apps/workspace-svc/src/routes/sets.ts`
- Modify: `apps/workspace-svc/src/routes/runs.ts`
- Modify: `apps/workspace-svc/src/routes/custom-functions.ts`

- [ ] **Step 1: Patch `routes/schemas.ts`**

Find the `resolveWorkspace` block (around [routes/schemas.ts:320](../../apps/workspace-svc/src/routes/schemas.ts#L320)):

```ts
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
```

Replace with:

```ts
  const resolveWorkspace = async (request: FastifyRequest, reply: FastifyReply, wsId: string) => {
    const auth = request.auth;
    if (!auth) {
      await reply.code(401).send({ error: 'unauthenticated' });
      return null;
    }
    const ws = await db.workspaces.findOne({ id: asId<WorkspaceId>(wsId) });
    if (!ws || ws.orgId !== auth.orgId || ws.deletedAt) {
      await reply.code(404).send({ error: 'workspace not found' });
      return null;
    }
    return { auth, workspace: ws };
  };
```

- [ ] **Step 2: Patch `routes/sets.ts` the same way**

Same replacement, in [routes/sets.ts:75](../../apps/workspace-svc/src/routes/sets.ts#L75).

- [ ] **Step 3: Patch `routes/runs.ts` the same way**

Same replacement, in [routes/runs.ts:43](../../apps/workspace-svc/src/routes/runs.ts#L43).

- [ ] **Step 4: Patch `routes/custom-functions.ts` the same way**

Same replacement, in [routes/custom-functions.ts:68](../../apps/workspace-svc/src/routes/custom-functions.ts#L68).

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @mirage/workspace-svc exec tsc -p tsconfig.json --noEmit
```

Expected: no output (success).

- [ ] **Step 6: Stage**

```bash
git add apps/workspace-svc/src/routes/schemas.ts \
        apps/workspace-svc/src/routes/sets.ts \
        apps/workspace-svc/src/routes/runs.ts \
        apps/workspace-svc/src/routes/custom-functions.ts
```

Pause for explicit user approval before `git commit`.

---

## Task 7: Forward DELETE through the BFF

**Files:**
- Modify: `apps/bff/src/routes/workspaces.ts`

- [ ] **Step 1: Add the delete forwarder**

Replace the `registerWorkspaceProxyRoutes` function in [apps/bff/src/routes/workspaces.ts](../../apps/bff/src/routes/workspaces.ts) (line 50):

```ts
export function registerWorkspaceProxyRoutes(app: FastifyInstance): void {
  app.get('/workspaces', (req, reply) => forward(req, reply, '/workspaces'));
  app.post('/workspaces', (req, reply) => forward(req, reply, '/workspaces'));
  app.get<{ Params: { id: string } }>('/workspaces/:id', (req, reply) =>
    forward(req, reply, `/workspaces/${encodeURIComponent(req.params.id)}`),
  );
  app.delete<{ Params: { id: string } }>('/workspaces/:id', (req, reply) =>
    forward(req, reply, `/workspaces/${encodeURIComponent(req.params.id)}`),
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/bff exec tsc -p tsconfig.json --noEmit
```

Expected: no output (success).

- [ ] **Step 3: Stage**

```bash
git add apps/bff/src/routes/workspaces.ts
```

Pause for explicit user approval before `git commit`.

---

## Task 8: SPA — render the "Deleting…" state in `WorkspaceRow`

**Files:**
- Modify: `apps/web/src/components/workspace-picker/WorkspaceRow.tsx`

- [ ] **Step 1: Update the row**

Replace [apps/web/src/components/workspace-picker/WorkspaceRow.tsx](../../apps/web/src/components/workspace-picker/WorkspaceRow.tsx) with:

```tsx
import { ArrowRight } from 'lucide-react';
import type { Api } from '@mirage/types';
import { cn } from '@mirage/ui-kit';
import { colorForId, initialsForName } from './avatar.js';

type WorkspaceDto = Api.components['schemas']['Workspace'];

interface WorkspaceRowProps {
  workspace: WorkspaceDto;
  selected: boolean;
  onSelect: () => void;
}

export function WorkspaceRow({ workspace, selected, onSelect }: WorkspaceRowProps) {
  const color = colorForId(workspace.id);
  const initials = initialsForName(workspace.name);
  const deleting = Boolean(workspace.deletedAt);

  return (
    <button
      type="button"
      onClick={deleting ? undefined : onSelect}
      aria-disabled={deleting}
      disabled={deleting}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        deleting
          ? 'cursor-not-allowed border-border bg-muted/40 opacity-60'
          : selected
            ? 'border-brand-violet/40 bg-brand-violet/5'
            : 'border-border bg-background hover:border-brand-violet/30 hover:bg-accent',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 flex-none items-center justify-center rounded-lg text-[12px] font-semibold',
          deleting ? 'bg-muted text-muted-foreground' : color.bg,
          deleting ? '' : color.fg,
        )}
      >
        {initials}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-[14px] font-medium',
              deleting ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {workspace.name}
          </span>
          {deleting ? (
            <span className="flex h-[18px] items-center gap-1 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              Deleting…
            </span>
          ) : (
            <span className="flex h-[18px] items-center gap-1 rounded-full bg-brand-emerald/10 px-1.5 text-[10px] font-medium text-brand-emerald">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-emerald" />
              dev
            </span>
          )}
        </div>
        {deleting ? (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            Cleaning up data — this can take a moment.
          </p>
        ) : workspace.description ? (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {workspace.description}
          </p>
        ) : (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            Created {formatDate(workspace.createdAt)} · — members
          </p>
        )}
      </div>

      {!deleting && (
        <ArrowRight
          size={16}
          strokeWidth={1.75}
          className={cn(
            'flex-none text-muted-foreground transition-colors',
            selected ? 'text-brand-violet' : 'group-hover:text-foreground',
          )}
        />
      )}
    </button>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/web exec tsc -p tsconfig.json --noEmit
```

Expected: no output (success).

- [ ] **Step 3: Stage**

```bash
git add apps/web/src/components/workspace-picker/WorkspaceRow.tsx
```

Pause for explicit user approval before `git commit`.

---

## Task 9: SPA — confirm modal component

**Files:**
- Create: `apps/web/src/components/workspace-picker/DeleteWorkspaceModal.tsx`

- [ ] **Step 1: Create the modal**

Create [apps/web/src/components/workspace-picker/DeleteWorkspaceModal.tsx](../../apps/web/src/components/workspace-picker/DeleteWorkspaceModal.tsx):

```tsx
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@mirage/ui-kit';

interface DeleteWorkspaceModalProps {
  workspaceName: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteWorkspaceModal({
  workspaceName,
  open,
  onClose,
  onConfirm,
}: DeleteWorkspaceModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  const handleConfirm = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete workspace.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-workspace-title"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="delete-workspace-title"
              className="text-[15px] font-semibold text-foreground"
            >
              Delete workspace “{workspaceName}”?
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              This permanently removes all schemas, sets, custom functions, and
              generated data for this workspace. This cannot be undone.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className={cn(
              'h-9 rounded-md border border-input bg-background px-3 text-[13px] font-medium transition-colors',
              'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleConfirm()}
            className={cn(
              'h-9 rounded-md bg-destructive px-3 text-[13px] font-medium text-destructive-foreground transition-opacity',
              'hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {submitting ? 'Deleting…' : 'Delete workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/web exec tsc -p tsconfig.json --noEmit
```

Expected: no output (success).

- [ ] **Step 3: Stage**

```bash
git add apps/web/src/components/workspace-picker/DeleteWorkspaceModal.tsx
```

Pause for explicit user approval before `git commit`.

---

## Task 10: SPA — wire delete into the detail card

**Files:**
- Modify: `apps/web/src/components/workspace-picker/WorkspaceDetailCard.tsx`

- [ ] **Step 1: Update the detail card**

Replace [apps/web/src/components/workspace-picker/WorkspaceDetailCard.tsx](../../apps/web/src/components/workspace-picker/WorkspaceDetailCard.tsx) with:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Api } from '@mirage/types';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../api/client.js';
import { useUiStore } from '../../state/store.js';
import { colorForId, initialsForName } from './avatar.js';
import { DeleteWorkspaceModal } from './DeleteWorkspaceModal.js';

type WorkspaceDto = Api.components['schemas']['Workspace'];

interface WorkspaceDetailCardProps {
  workspace: WorkspaceDto;
}

export function WorkspaceDetailCard({ workspace }: WorkspaceDetailCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentOrgId = useUiStore((s) => s.currentOrgId);
  const currentWorkspaceId = useUiStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspaceId = useUiStore((s) => s.setCurrentWorkspaceId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const color = colorForId(workspace.id);
  const initials = initialsForName(workspace.name);
  const deleting = Boolean(workspace.deletedAt);

  const deleteMutation = useMutation({
    mutationFn: async (): Promise<{ id: string; deletedAt: string }> => {
      const { data, error, response } = await bff.DELETE('/workspaces/{id}', {
        params: { path: { id: workspace.id } },
      });
      if (error) {
        // openapi-fetch returns the raw error body. For 403 the BFF echoes
        // workspace-svc's `{ error: 'only org owners…' }`.
        const message =
          typeof error === 'object' && error !== null && 'error' in error
            ? String((error as { error?: unknown }).error ?? 'Failed to delete workspace.')
            : `Delete failed (${response.status})`;
        throw new Error(message);
      }
      if (!data) throw new Error('Delete returned no body');
      return data;
    },
    onSuccess: ({ deletedAt }) => {
      // Optimistically mark the row as deleting so the list re-renders
      // immediately; the 5s polling in WorkspacesPage will hard-drop it
      // once the cascade finishes.
      queryClient.setQueryData<WorkspaceDto[]>(
        ['workspaces', currentOrgId],
        (prev) =>
          prev?.map((w) => (w.id === workspace.id ? { ...w, deletedAt } : w)) ?? prev,
      );
      // If this was the active workspace, clear the selection.
      if (currentWorkspaceId === workspace.id) {
        setCurrentWorkspaceId(null);
      }
      setConfirmOpen(false);
    },
  });

  return (
    <div className="flex h-full flex-col gap-5 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Selected workspace
        </span>
        {deleting ? (
          <span className="flex h-[18px] items-center gap-1 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            Deleting…
          </span>
        ) : (
          <span className="flex h-[18px] items-center gap-1 rounded-full bg-brand-emerald/10 px-1.5 text-[10px] font-medium text-brand-emerald">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-emerald" />
            dev
          </span>
        )}
      </div>

      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-12 w-12 flex-none items-center justify-center rounded-lg text-[14px] font-semibold',
            deleting ? 'bg-muted text-muted-foreground' : color.bg,
            deleting ? '' : color.fg,
          )}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn('truncate text-[16px] font-semibold', deleting ? 'text-muted-foreground' : 'text-foreground')}>
            {workspace.name}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {workspace.id} · created {formatDate(workspace.createdAt)}
          </div>
        </div>
      </div>

      {workspace.description && (
        <p className={cn('text-[13px] leading-relaxed', deleting ? 'text-muted-foreground' : 'text-foreground/80')}>
          {workspace.description}
        </p>
      )}

      <div className="grid grid-cols-4 gap-2 border-y border-border py-4">
        <Stat label="Schemas" value="—" />
        <Stat label="Sets" value="—" />
        <Stat label="Total rows" value="—" />
        <Stat label="Members" value="—" />
      </div>

      <div className="flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Recent activity
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">No activity yet.</p>
      </div>

      <button
        type="button"
        disabled={deleting}
        onClick={() => navigate(`/workspaces/${workspace.id}/schemas`)}
        className={cn(
          'flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90',
          deleting && 'cursor-not-allowed opacity-50 hover:opacity-50',
        )}
      >
        Continue to workspace
        <ArrowRight size={16} strokeWidth={2} />
      </button>

      {!deleting && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="flex h-8 items-center justify-center gap-1.5 self-start text-[12px] font-medium text-destructive transition-opacity hover:opacity-80"
        >
          <Trash2 size={13} strokeWidth={2} />
          Delete workspace
        </button>
      )}

      <DeleteWorkspaceModal
        open={confirmOpen}
        workspaceName={workspace.name}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await deleteMutation.mutateAsync();
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/web exec tsc -p tsconfig.json --noEmit
```

Expected: no output (success).

- [ ] **Step 3: Stage**

```bash
git add apps/web/src/components/workspace-picker/WorkspaceDetailCard.tsx
```

Pause for explicit user approval before `git commit`.

---

## Task 11: SPA — poll while deletions are in flight; auto-select skips deleted

**Files:**
- Modify: `apps/web/src/pages/workspaces/WorkspacesPage.tsx`

- [ ] **Step 1: Update the page**

Replace [apps/web/src/pages/workspaces/WorkspacesPage.tsx](../../apps/web/src/pages/workspaces/WorkspacesPage.tsx) with:

```tsx
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Api } from '@mirage/types';
import { useUiStore } from '../../state/store.js';
import { bff } from '../../api/client.js';

type WorkspaceDto = Api.components['schemas']['Workspace'];
import { WorkspaceList } from '../../components/workspace-picker/WorkspaceList.js';
import { WorkspaceDetailCard } from '../../components/workspace-picker/WorkspaceDetailCard.js';
import { WorkspacesEmptyState } from '../../components/workspace-picker/WorkspacesEmptyState.js';

export function WorkspacesPage() {
  const currentOrgId = useUiStore((s) => s.currentOrgId);
  const setCurrentWorkspaceId = useUiStore((s) => s.setCurrentWorkspaceId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const workspaces = useQuery({
    enabled: Boolean(currentOrgId),
    queryKey: ['workspaces', currentOrgId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces');
      if (error) throw error;
      return data;
    },
    // While any row is mid-cascade, poll so the row drops once the cascade
    // hard-deletes it server-side.
    refetchInterval: (query): number | false => {
      const data = query.state.data as WorkspaceDto[] | undefined;
      return data?.some((w) => w.deletedAt) ? 5000 : false;
    },
  });

  // Auto-select the most-recently-updated non-deleted workspace.
  useEffect(() => {
    const live = workspaces.data?.filter((w: WorkspaceDto) => !w.deletedAt) ?? [];
    if (live.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && live.some((w) => w.id === selectedId)) return;
    setSelectedId(live[0]!.id);
  }, [workspaces.data, selectedId]);

  // Mirror the picker's selection into Zustand.
  useEffect(() => {
    if (selectedId) setCurrentWorkspaceId(selectedId);
  }, [selectedId, setCurrentWorkspaceId]);

  if (!currentOrgId) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center text-[13px] text-muted-foreground">
        Select an organization to see its workspaces.
      </div>
    );
  }

  if (workspaces.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-3">
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="h-[420px] animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (workspaces.isError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-[13px] text-destructive">
        Failed to load workspaces.{' '}
        <button
          type="button"
          onClick={() => void workspaces.refetch()}
          className="font-medium underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const liveWorkspaces = workspaces.data?.filter((w: WorkspaceDto) => !w.deletedAt) ?? [];
  if (!workspaces.data || liveWorkspaces.length === 0) {
    // If every workspace is mid-deletion we still show the list (so the user
    // sees their rows greying out), but treat zero-row state as empty.
    if (!workspaces.data || workspaces.data.length === 0) {
      return <WorkspacesEmptyState />;
    }
  }

  const selected = workspaces.data.find((w: WorkspaceDto) => w.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <WorkspaceList
        workspaces={workspaces.data}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      {selected && <WorkspaceDetailCard workspace={selected} />}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/web exec tsc -p tsconfig.json --noEmit
```

Expected: no output (success).

- [ ] **Step 3: Stage**

```bash
git add apps/web/src/pages/workspaces/WorkspacesPage.tsx
```

Pause for explicit user approval before `git commit`.

---

## Task 12: SPA — hide deleted workspaces from the top-bar switcher

**Files:**
- Modify: `apps/web/src/components/shell/WorkspaceSwitcher.tsx`

- [ ] **Step 1: Filter the dropdown**

In [apps/web/src/components/shell/WorkspaceSwitcher.tsx](../../apps/web/src/components/shell/WorkspaceSwitcher.tsx), find the dropdown rendering block:

```tsx
          ) : workspaces.data && workspaces.data.length === 0 ? (
            <p className="mt-1 px-1 text-[12px] text-muted-foreground">
              No workspaces yet in this org.
            </p>
          ) : (
            <ul className="mt-1 flex flex-col">
              {workspaces.data?.map((ws) => (
```

Replace the `<ul>` block with a filtered version:

```tsx
          ) : workspaces.data && workspaces.data.filter((w) => !w.deletedAt).length === 0 ? (
            <p className="mt-1 px-1 text-[12px] text-muted-foreground">
              No workspaces yet in this org.
            </p>
          ) : (
            <ul className="mt-1 flex flex-col">
              {workspaces.data
                ?.filter((ws) => !ws.deletedAt)
                .map((ws) => (
```

Also update the `currentWorkspace` lookup near the top of the component (line 46):

```tsx
  const currentWorkspace = workspaces.data?.find((w) => w.id === wsIdFromUrl);
```

Replace with:

```tsx
  const currentWorkspace = workspaces.data?.find(
    (w) => w.id === wsIdFromUrl && !w.deletedAt,
  );
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/web exec tsc -p tsconfig.json --noEmit
```

Expected: no output (success).

- [ ] **Step 3: Stage**

```bash
git add apps/web/src/components/shell/WorkspaceSwitcher.tsx
```

Pause for explicit user approval before `git commit`.

---

## Task 13: End-to-end manual verification

This is a manual sanity-check task — no code changes. Run through each scenario, observe behaviour, and tick the box only after verifying.

**Prereqs**

- `docker-compose` from `infra/` is running (Mongo, Redis, MinIO, Keycloak).
- All services are running: `nx run-many -t serve` (or individually).
- You are signed in as an org **owner**. If your user is the default `editor`, promote yourself via mongosh:
  ```js
  use mirage;
  db.memberships.updateOne(
    { userId: '<your uid>', orgId: '<your orgId>', workspaceId: { $exists: false } },
    { $set: { role: 'owner' } },
  );
  ```

- [ ] **Scenario 1: empty workspace**
  - Create a brand-new workspace via the picker.
  - Open it, then go back to `/workspaces` and click `Delete workspace`. Confirm.
  - Expected: row turns grey with `Deleting…` for ~1 second, then disappears.
  - Verify in MinIO that no keys exist under `org/<orgId>/workspace/<wsId>/` (likely already none).
  - Verify in mongosh: `db.workspaces.findOne({ id: '<wsId>' })` returns null.

- [ ] **Scenario 2: workspace with schemas, sets, and a run artifact**
  - In a workspace, create a schema, a set, and run the set to completion.
  - Confirm the artifact exists in MinIO (`mc ls` or via the MinIO console under `mirage/org/.../workspace/.../run/`).
  - Delete the workspace. Wait for the row to vanish.
  - Verify all of these return empty: `db.schemas.find({ workspaceId: '<wsId>' })`, `db.sets.find(...)`, `db.runs.find(...)`, `db.custom_functions.find(...)`.
  - Verify MinIO has no keys under that prefix.

- [ ] **Scenario 3: in-flight run cancellation**
  - Start a set run that takes ≥ 30 s (e.g., bump the count so generation is slow).
  - While the run is `running`, delete the workspace.
  - Expected: workspace row goes grey immediately. The generation-worker logs show the run is cancelled.
  - The cascade completes within ~5 seconds of the run reaching terminal state.

- [ ] **Scenario 4: duplicate delete**
  - With curl, hit `DELETE /workspaces/<wsId>` against the BFF using a fresh, undeleted workspace.
  - First call: `202`.
  - Immediately repeat the same call. Expected: `409 { error: 'workspace is already being deleted' }`.

- [ ] **Scenario 5: non-owner is rejected**
  - With a second user whose org membership is `editor` (no override), hit `DELETE /workspaces/<wsId>`.
  - Expected: `403 { error: 'only org owners can delete a workspace' }`.

- [ ] **Scenario 6: restart mid-cascade**
  - Start a delete on a workspace with an active run (so the cascade is stuck draining).
  - Kill `workspace-svc` (`Ctrl-C` the `nx serve` running it) within ~3 s.
  - Restart it. On boot, the log should show `workspace-cascade: startup sweep` with a non-zero count.
  - Verify the workspace eventually disappears from `/workspaces`.

- [ ] **Scenario 7: dropdown filters deleted rows**
  - Start a delete on a workspace with a slow run so it stays in soft-deleted state for a while.
  - Open the top-bar workspace switcher dropdown.
  - Expected: the soft-deleted workspace is **not** listed in the dropdown (it's only visible in `/workspaces`).

- [ ] **Scenario 8: currently-active workspace deleted from another tab**
  - In tab A, open a workspace and stay on `/workspaces/<wsId>/schemas`.
  - In tab B, navigate to `/workspaces`, delete that same workspace.
  - In tab A on next API call (e.g., refresh schemas), expect 404s from `/workspaces/<wsId>/schemas`. (This isn't a perfect UX — proper redirect on 404 is out of scope; verify the behaviour but no fix needed here.)

---

## Task 14: Hand over

- [ ] **Step 1: Mark the plan complete**

Confirm with the user that everything in Task 13 works. Note in the conversation any deviations or follow-ups.

- [ ] **Step 2: Pause for the user to commit**

The user has a strict no-auto-commit policy. The staged files across all tasks should be committed by the user when they're satisfied with the change.

---

## Self-review notes

- **Spec coverage:** Every requirement from `2026-05-22-workspace-delete-design.md` maps to a task: Phase 1 endpoint (Task 5), Phase 2 cascade (Tasks 2+4), startup sweep (Task 4), `resolveWorkspace` rejection (Task 6), OpenAPI + type changes (Task 1), BFF forward (Task 7), UI (Tasks 8–12), manual verification (Task 13).
- **No placeholders:** every code step has full source. No "TBD".
- **Type consistency:** `WorkspaceCascade` exposes `enqueue` / `runStartupSweep` / `waitIdle` — used identically in Task 4 (server.ts) and Task 3 (tests). Route signature `registerWorkspaceRoutes(app, db, cascade)` is updated in Task 4 (caller) and Task 5 (callee).
- **Out-of-band note:** Task 4 deliberately leaves `tsc` failing temporarily; Task 5 fixes it. The staging step in Task 4 is fine because the change is real, but the user may prefer to defer committing Task 4 + Task 5 together — flagged in Task 4 Step 3.
