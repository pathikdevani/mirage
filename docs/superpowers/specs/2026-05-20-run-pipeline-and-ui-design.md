# Run Pipeline + UI — Design

> Date: 2026-05-20
> Status: Approved (brainstorming complete, plan pending)
> Scope: Sub-project 4 of 4 in the "Sets end-to-end" initiative.

## Context

The engine and sandbox shipped in sub-project 3. `runSet(...)` produces deterministic rows with references filled in. What's still missing is the pipeline that wires `runSet` into the rest of the system — a Mongo `runs` collection, BullMQ orchestration, NDJSON streaming to MinIO, WebSocket progress events, the Run button activation, the Preview tab, the HistoryPage, and cancellation.

This sub-project is the final slice. After it lands, a user can open a Set, click **Run set**, watch the progress live, and inspect the produced rows in a paged Preview tab.

## Sub-project plan (context for this spec)

1. ✅ Sets CRUD.
2. ✅ Custom Functions CRUD.
3. ✅ Engine + sandbox.
4. **Run pipeline + UI** ← this spec.

## Goals

- A Run can be created by the SPA, processed asynchronously by the generation-worker, and observed by the SPA via WebSocket events.
- The latest artifact per Set is cached as NDJSON in MinIO. Older artifacts are evicted when a new Run starts for the same Set.
- The Preview tab renders the produced rows paged from the server.
- The HistoryPage lists past Runs across the workspace with status, duration, and row totals.
- A Run can be cancelled while in progress; the worker stops cleanly between Schemas.
- The Run UI lives inline in the Set header (button → progress bar → completed state); on completion the Preview tab activates automatically.

## Non-goals

- Run retries (`failed` runs require the user to click Run again).
- Per-schema-row-level progress finer than 500 rows.
- Multiple cached artifacts per Set (eviction policy is single-artifact, latest wins).
- Run-time concurrency across Sets within a single worker process (BullMQ concurrency knob covers cross-job parallelism; per-Run parallelism is single-threaded plus the sandbox pool).
- Per-row streaming generation (the engine returns the full `rowsByKey` map in memory; sub-project 4 streams that map to S3 but doesn't pipeline generation with upload).
- A WebUI for the Run job queue. BullMQ Board can be mounted later if needed.
- TypeScript-aware Custom Functions (still JavaScript; same as sub-project 3).

## Architectural decisions (locked in during brainstorming)

| Decision | Choice | Why |
|---|---|---|
| Run UI placement | Inline in the Set header (Run → progress → completed badge); auto-switch to Preview on done | Matches the existing design's `SetDetail` head + Preview tab pattern |
| Preview data fetch | Server-side paged JSON via `GET /runs/:id/preview?schemaKey=X&offset=N&limit=M` | Works for any artifact size; reuses the BFF auth boundary |
| Cancellation | Explicit Cancel button → Redis `cancelFlagKey` → worker polls between schemas | Matches the architecture's existing design |
| Artifact retention | Single latest artifact per Set; older Runs' `artifactKey` is nulled on Mongo, S3 object deleted | Spec from CONTEXT.md / TECH_ARCHITECHRE.md §4; keeps storage bounded |
| Run.kind in v1 | `full` only on the wire; `preview` plumbing kept but no UI affordance | YAGNI; the preview-queue wiring already exists |
| WebSocket model | Single connection per browser session, subscribe/unsubscribe per runId, BFF maintains a Redis subscriber and fans out | Matches §3.2 single-ingress |

## Data model

### OpenAPI additions ([packages/types/openapi.yaml](../../../packages/types/openapi.yaml))

```yaml
Run:
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
      additionalProperties: { type: integer }   # keyed by schemaKey
    startedAt: { type: string, format: date-time }
    endedAt: { type: string, format: date-time }
    errorMessage: { type: string }
    requestedBy: { type: string }
    createdAt: { type: string, format: date-time }

RunListItem:
  # Slimmer projection used by HistoryPage + per-set listings.
  required: [id, setId, status, kind, requestedBy, createdAt]
  properties:
    id, setId, status, kind, startedAt?, endedAt?, requestedBy, createdAt,
    rowCounts? (Record<schemaKey, integer>), errorMessage?

RunPreviewPage:
  required: [rows, total, schemaKey, offset]
  properties:
    schemaKey: { type: string }
    offset: { type: integer, minimum: 0 }
    total: { type: integer }
    rows: { type: array, items: {} }       # arbitrary row shape per schema
```

**Routes** (added under `/workspaces/{wsId}`):

```yaml
POST   /workspaces/{wsId}/sets/{id}/run                          → 201 Run    (enqueue)
POST   /workspaces/{wsId}/runs/{id}/cancel                       → 204
GET    /workspaces/{wsId}/runs                                    → RunListItem[]
                                  ?setId=optional&status=optional&limit=50
GET    /workspaces/{wsId}/runs/{id}                               → Run
GET    /workspaces/{wsId}/runs/{id}/preview                       → RunPreviewPage
                                  ?schemaKey=required&offset=0&limit=200
```

### MongoDB

New collection `runs` declared in [apps/workspace-svc/src/db.ts](../../../apps/workspace-svc/src/db.ts).

Indexes:

| Index | Purpose |
|---|---|
| `{ id: 1 }` unique | direct lookup by run id |
| `{ orgId: 1, workspaceId: 1, createdAt: -1 }` | HistoryPage list |
| `{ workspaceId: 1, setId: 1, createdAt: -1 }` | per-Set newest-first lookup |
| `{ workspaceId: 1, status: 1, createdAt: -1 }` | HistoryPage status filter |

Run ids are `run_<nanoid(16)>`.

## Backend

### workspace-svc — runs routes

New file [apps/workspace-svc/src/routes/runs.ts](../../../apps/workspace-svc/src/routes/runs.ts). Same `resolveWorkspace` + role checks as the other route modules.

#### POST `/workspaces/:wsId/sets/:id/run`

1. Resolve workspace + auth. Viewer 403.
2. Load Set; 404 if missing.
3. **Evict previous artifact for this Set:** find the most recent Run for this `setId` with a non-null `artifactKey`. If found, call `s3.DeleteObject` for that key (best-effort — log + continue on failure) and update its Mongo row to clear `artifactKey`.
4. Insert new Run with `id: run_<nanoid>`, `kind: 'full'`, `status: 'queued'`, `requestedBy: auth.userId`, `createdAt: now`.
5. Enqueue BullMQ job on `mirage-runs` queue with payload `{ runId, setId, orgId, workspaceId, requestedBy, kind: 'full' }`.
6. Return 201 with the Run document.

The BullMQ client lives in workspace-svc — add `bullmq` + `ioredis` deps.

#### POST `/workspaces/:wsId/runs/:id/cancel`

1. Resolve workspace + auth. Editor required.
2. Verify the Run belongs to this workspace.
3. Set Redis `run:{runId}:cancel = '1'` with 10-minute expiry.
4. Return 204.

#### GET `/workspaces/:wsId/runs`

- Query params: `setId?`, `status?`, `limit?` (default 50, max 500), `offset?` (default 0).
- Returns `RunListItem[]` sorted by `createdAt: -1`.

#### GET `/workspaces/:wsId/runs/:id`

- Returns the full Run document.

#### GET `/workspaces/:wsId/runs/:id/preview`

- Query params: `schemaKey` (required), `offset` (default 0), `limit` (default 200, max 1000).
- Fetches the artifact via `s3.GetObject(runArtifactKey)`. 404 if `artifactKey` is missing or NoSuchKey.
- Stream-parses the NDJSON line-by-line. For each line where `__schemaKey === schemaKey`:
  - Track total count.
  - If `count > offset && count <= offset + limit`, push to the page.
- Returns `{ schemaKey, offset, total, rows }`.
- Performance: a 1M-row artifact is parsed linearly here. For v1, accept this; if `runs.rowCounts[schemaKey]` is set on the Run, use it as `total` and break out of the scan as soon as the page is filled.

### BFF proxy

New file [apps/bff/src/routes/runs.ts](../../../apps/bff/src/routes/runs.ts) — same `forward()` pattern as the other proxies. Routes proxied:

- `POST /workspaces/:wsId/sets/:id/run`
- `POST /workspaces/:wsId/runs/:id/cancel`
- `GET /workspaces/:wsId/runs`
- `GET /workspaces/:wsId/runs/:id`
- `GET /workspaces/:wsId/runs/:id/preview` (passes querystring through)

### BFF WebSocket — real subscription model

Rewrite [apps/bff/src/routes/ws.ts](../../../apps/bff/src/routes/ws.ts):

- Module-scope singleton: a `subscriber: ioredis.Redis` instance in subscribe-mode + a `subscriptions: Map<channel, Set<WebSocket>>` map.
- WS client subscribes via `{ type: 'subscribe', runId }`. BFF:
  - Verifies the run exists in the user's org by calling `GET /workspaces/:wsId/runs/:id` against workspace-svc (or — to avoid the extra hop — derives `orgId` from `request.auth` and trusts that the user knows their own runIds; runs in another org will silently receive nothing).
  - Computes `channel = org:{orgId}:run:{runId}`.
  - Adds the socket to `subscriptions[channel]`. If new, calls `subscriber.subscribe(channel)`.
  - Sends `{ type: 'subscribed', runId }` ack.
- Server `subscriber.on('message', (channel, payload) => { forEach socket in subscriptions[channel] → send(payload) })`.
- WS client unsubscribes via `{ type: 'unsubscribe', runId }` OR by closing. On the last subscriber leaving a channel, BFF calls `subscriber.unsubscribe(channel)`.
- The browser sends its JWT as `?token=...` query parameter on the WS handshake URL; the existing auth plugin handles tokens-via-query for WS routes already (verify on landing, store on `request.auth`).

### Generation worker — real processor

Replace [apps/generation-worker/src/processor.ts](../../../apps/generation-worker/src/processor.ts) and add three companion files.

#### New layout

```
apps/generation-worker/src/
  main.ts                  unchanged (already boots two workers)
  queues.ts                unchanged
  db.ts                    NEW — small Mongo client + collection handles
  processor.ts             REWRITTEN — orchestrates run + publishes events
  loaders.ts               NEW — load Set + Schemas + CustomFunctions from Mongo
  artifact-writer.ts       NEW — streams NDJSON to S3 via @aws-sdk/lib-storage Upload
  cancel.ts                NEW — Redis cancel-flag polling helper
  sandbox-singleton.ts     NEW — process-level SandboxPool shared across jobs
```

#### Processor flow

```
on job:
  1. mark Run as running, set startedAt, publish run.started
  2. cancel-check (in case the user clicked cancel before the worker picked it up)
  3. load: set, schemas (workspace-wide), customFunctions (workspace-wide)
     - if anything missing → mark failed, publish run.failed
  4. build CustomFunctionRegistry from the loaded functions
  5. run = await engine.runSet({ set, schemas, customFunctions, sandbox })  // sandbox shared, see below
     - between every 500-row chunk during NDJSON write (step 6), cancel-check
  6. open S3 multipart upload, stream NDJSON rows (schema by schema, JSON.stringify(row)+'\n')
  7. on success → mark completed, set artifactKey, rowCounts, endedAt; publish run.completed
  8. on cancel → abort upload, mark cancelled, endedAt; publish run.cancelled
  9. on error → mark failed, set errorMessage, endedAt; publish run.failed (don't rethrow)
```

#### Progress events

- After loading: `run.started` (already done at step 1).
- After each Schema's rows are written to S3: `run.progress` with `produced = sum of rows written so far`, `total = sum of all set.schemas[].count`.
- On success: `run.completed` with `artifactKey` and per-schema `rowCounts`.
- On cancel: `run.cancelled`.
- On failure: `run.failed` with `message`.

For v1, **progress between rows of a single Schema** is approximated to "after each schema" — we don't pipeline generation and upload. The engine produces all rows in memory first; then we serialise to S3. Per-500-row progress is reserved for the streaming pass (post-v1).

#### Sandbox pool sharing

A single `SandboxPool` is created once at module load (`sandbox-singleton.ts`) and reused across all jobs. Pool size from env (`SANDBOX_POOL_SIZE`, default 2). Timeout per call: `SANDBOX_CALL_TIMEOUT_MS` (default 5000). Memory cap: `SANDBOX_MEMORY_CAP_MB` (default 64).

#### S3 streaming

`artifact-writer.ts` uses `@aws-sdk/lib-storage`'s `Upload` for multipart streaming. It exposes a `RunArtifactWriter` class:

```ts
class RunArtifactWriter {
  constructor(opts: { orgId, workspaceId, runId, s3Client, bucket });
  async writeRow(row: unknown): Promise<void>;     // pushes JSON.stringify(row)+'\n'
  async close(): Promise<void>;                    // finalises multipart
  async abort(): Promise<void>;                    // cancels multipart
}
```

Backed by a Node `PassThrough` stream piped into `new Upload({ Bucket, Key, Body: passThrough })`.

#### Cancel polling

`cancel.ts` exposes `isCancelled(runId): Promise<boolean>` — single Redis GET on `cancelFlagKey(runId)`. The processor calls it after every schema's rows have been written (cheap, infrequent).

### Workspace-svc dependencies

Add to [apps/workspace-svc/package.json](../../../apps/workspace-svc/package.json):

- `bullmq` (for enqueueing)
- `ioredis` (for cancel flag set)
- `@aws-sdk/client-s3` (for artifact eviction + preview NDJSON stream)

### Generation-worker dependencies

Already lists `@mirage/engine`, `@mirage/sandbox`, `bullmq`, `ioredis`, `pino`. Add:

- `@aws-sdk/client-s3` (S3 client)
- `@aws-sdk/lib-storage` (multipart Upload)
- `mongodb` (Set/Schema/Function loaders)

## Frontend

### Routing changes

None — Sets, Functions, History pages already routed. The `?active=<setId>` query param continues to drive the Set DetailPane.

### File layout

```
apps/web/src/pages/dashboard/sets/
  RunControl.tsx                NEW — Run/Cancel button + progress + WS subscription
  PreviewTab.tsx                REWRITTEN — paged table per schema; fetches /runs/:id/preview
  DetailPane.tsx                MODIFIED — replace disabled Run button with <RunControl />
apps/web/src/pages/dashboard/HistoryPage.tsx           REWRITTEN
apps/web/src/state/runs.ts                             NEW — Zustand: { setRuns: Map<setId, RunState> }
apps/web/src/api/ws.ts                                 NEW — WS singleton + subscribe/unsubscribe API
apps/web/src/components/RunStatusBadge.tsx             NEW — shared status pill (HistoryPage + RunControl)
```

### Zustand `runs` slice

```ts
type RunState =
  | { phase: 'idle' }
  | { phase: 'starting'; runId: RunId }
  | { phase: 'running'; runId: RunId; produced: number; total: number; startedAt: string }
  | { phase: 'completed'; runId: RunId; rowCounts: Record<string, number>; duration: string }
  | { phase: 'failed'; runId: RunId; message: string }
  | { phase: 'cancelled'; runId: RunId };

interface RunsSlice {
  setRuns: Map<string, RunState>;        // keyed by setId
  setRunState: (setId: string, next: RunState) => void;
}
```

The Zustand store lets RunControl re-mount with the live state preserved (e.g. user navigates to Schemas and back during a long run).

### WebSocket client (`apps/web/src/api/ws.ts`)

Singleton:

```ts
export const ws = {
  connect(token: string): void;                                        // call on auth-ready
  subscribe(runId: string, handler: (e: RunEvent) => void): () => void; // returns unsubscribe
  disconnect(): void;
};
```

Implementation:
- Opens `ws(s)://{bff}/ws?token={token}`.
- Reconnects with backoff (1s, 2s, 4s, 8s, 16s, 30s) on close.
- Tracks pending subscriptions; re-sends `{type:'subscribe',runId}` on reconnect.
- Dispatches events from the server to per-runId handlers.

A `<WsProvider>` in the React tree opens the connection when `useAuth().status === 'authenticated'` and closes it on sign-out.

### RunControl component

Renders inside the Set DetailPane header, replacing the disabled Run button (currently at [DetailPane.tsx:148-156](apps/web/src/pages/dashboard/sets/DetailPane.tsx)).

States and rendering:

- **idle** — Primary green **Run set** button with `<Play>` icon. Click → POST `/sets/:id/run`.
- **starting** — Spinner + "Queued…". On WS `run.started` → `running`.
- **running** — Linear progress bar with `{produced.toLocaleString()} / {total.toLocaleString()} rows` + Cancel button. WS `run.progress` updates `produced`. Cancel click → POST `/runs/:id/cancel`.
- **completed** — Green badge "Completed · {duration}". **Run again** button. Side-effect: imperatively switch the DetailPane's active tab to `preview`.
- **failed** — Red badge with `{message}` (truncated; tooltip with full). **Retry** button (resets to idle, ready to POST again).
- **cancelled** — Muted "Cancelled". **Run again** button.

On mount, RunControl reads `setRuns.get(setId)` from Zustand and (a) renders that state and (b) if it's `starting`/`running`, ensures a WS subscription exists for the runId. Unsubscribes on unmount only if no other component has the same subscription.

### PreviewTab rewrite

State machine driven by the latest Run for the Set:

```
useQuery(['runs', wsId, setId, 'latest'], () => GET /workspaces/:wsId/runs?setId=:id&limit=1)
```

- **No completed run** → empty state ("Click Run to generate data") with a Run button (just emits a click that RunControl picks up via shared store — or trigger directly via the same mutation).
- **Completed run with artifact** →
  - Top run-status bar: status, salt (from the set), total rows, duration, and **Download** button (opens `/runs/:id/export?format=ndjson` via export-svc; existing endpoint).
  - Tab strip — one tab per Schema in `run.rowCounts` keys.
  - Active schema tab paginates via `GET /workspaces/:wsId/runs/:id/preview?schemaKey=X&offset=0&limit=200`.
  - Render the rows in a table. Column headers come from the union of keys in the first 10 rows (excluding `__schemaKey` and `__id`, which we surface separately if at all).

### HistoryPage rewrite

`GET /workspaces/:wsId/runs?limit=50` (paginated client-side with offset query param on Previous/Next).

Columns:
| Status | Run id | Set | Kind | Started | Duration | Total rows | Requested by |
|---|---|---|---|---|---|---|---|

- Status uses the shared `<RunStatusBadge>` component.
- Click row → navigate to `/workspaces/:wsId/sets?active={run.setId}` (defaults to the Configuration tab, but the Preview tab will become accessible since the Set has an artifact).
- Filter strip: status (all/queued/running/completed/failed/cancelled), Set (dropdown of sets in the workspace).

### DetailPane modification

Replace the disabled Run button block with `<RunControl wsId={wsId} setId={set.id} onCompleted={() => setTab('preview')} />`. Pass the existing `setTab` setter so RunControl can flip the tab on completion.

## End-to-end smoke (manual)

After all tasks land:

1. `docker compose up -d`; `pnpm dev`.
2. Sign in. Create or open a Set with at least 1 included Schema and ≥10 rows.
3. Click **Run set**. Header shows "Queued…", then progress bar.
4. Watch the SPA's network panel: a WS connects to `/ws`; a `subscribe` message goes out; `run.started`, then `run.progress` ×N, then `run.completed` come back.
5. On completion, Preview tab opens automatically; rows render in the table.
6. Click **Download** — receives an NDJSON file.
7. Click **Run set** again — a *new* run starts. Previous artifact is evicted from S3 (verify via MinIO console).
8. During a run, click **Cancel**. Run finishes with status `cancelled`; no artifact.
9. Open **Run history**. The runs you just executed appear. Click one; it navigates back to the Set.
10. Open the schemas page → rename a schema referenced by a custom function → confirm Run still works after the cascade.

## Out of scope (revisited)

- Per-row-level progress (only per-schema for v1).
- Stream-from-engine to S3 in one pass (engine still buffers `rowsByKey` in memory).
- Multiple cached artifacts per Set.
- BullMQ Board / queue monitoring UI.
- Preview-kind runs surfaced in the UI.
- Run retry semantics; failed runs require a manual re-click.

## Open follow-ups (post-sub-project 4)

- Wrap `runSet` in a generator-style API so rows can stream to S3 as they're produced.
- Per-row progress with batched events.
- Preview-kind runs (5–10 rows) wired to a schema-editor live-preview pane.
- Cache `rowCounts[schemaKey]` write-back to `Run.rowCounts` so the preview endpoint's `total` calculation is O(1) instead of O(N).
- Run retention policy (auto-delete runs older than 30 days).
