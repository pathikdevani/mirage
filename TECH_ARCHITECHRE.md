# Mirage — Technical Architecture (High-Level)

> Living document. Updated iteratively as decisions are made.
> Scope: high-level development architecture. Not production-grade ops detail.

## 1. Goals & Constraints

- **Product**: Web-UI tool to define data shapes (Schemas), bundle them into Sets, and produce realistic fake data on demand. See [CONTEXT.md](CONTEXT.md) and [PRODUCT.md](PRODUCT.md).
- **Stack (fixed)**: Node.js (backend), React (frontend), MongoDB (storage), Keycloak (auth).
- **Node version**: latest Active LTS — **Node 24 (Krypton)**. Locked at the repo root in [`.nvmrc`](.nvmrc) (`lts/krypton`). All apps and CI use this version.
- **Style**: Distributed application — split into services so features can be developed and scaled independently.
- **Dev speed**: Optimise for fast feature development. Avoid premature production hardening.

## 2. Top-Level Service Map

```
                          ┌────────────────────────┐
                          │        Browser         │
                          │     React SPA (UI)     │
                          └───────┬───────────┬────┘
                       HTTPS/REST │           │ WebSocket (live)
                                  ▼           ▼
                          ┌────────────────────────┐
                          │   API Gateway / BFF    │◄─── Keycloak (OIDC)
                          └─┬────────┬──────────┬──┘
                 REST       │   REST │   pub/sub │
                            ▼        ▼           ▼
   ┌────────────────┐  ┌──────────────────┐  ┌────────────────────┐
   │  Workspace svc │  │  Export svc      │  │  Redis             │
   │                │  │  (in-repo conn.) │  │  (queue + pub/sub) │
   └───────┬────────┘  └───────┬──────────┘  └─────────▲──────────┘
           │                   │                       │
           ▼                   ▼                       │ enqueue / events
   ┌────────────────┐  ┌──────────────────┐            │
   │    MongoDB     │  │  External sinks  │  ┌─────────┴──────────┐
   │ (definitions,  │  │  (Mongo, PG, ES, │  │  Generation Worker │
   │  memberships,  │  │   Webhook, file  │  │  pool (Node.js)    │
   │  runs metadata)│  │   downloads)     │  │  + Custom-fn       │
   └────────────────┘  └──────────────────┘  │    sandbox         │
                                             └─────────┬──────────┘
                                                       │ NDJSON stream
                                                       ▼
                                             ┌────────────────────┐
                                             │ Object Storage     │
                                             │ (MinIO / S3) —     │
                                             │ cached Run artifacts│
                                             └────────────────────┘
```

Flow of a Run:

1. SPA → BFF `POST /sets/:id/run`.
2. BFF enqueues a job on Redis (BullMQ) and returns `runId`. SPA subscribes to WS for `run:{runId}` events.
3. A Generation Worker picks the job, executes the engine, streams NDJSON rows to object storage, publishes progress events to Redis pub/sub.
4. BFF forwards events to the SPA WebSocket. On `run.completed`, SPA invalidates queries and offers export actions.
5. SPA → BFF `POST /runs/:id/export` with a connector id + config. Export service opens the connector's `Sink`, streams rows from object storage through it.

## 3. Services (responsibilities only)

### 3.1 Frontend — React SPA
- **Stack**: React + TypeScript, Vite, React Router.
- **State**: TanStack Query for server data (caching, invalidation, optimistic updates against the OpenAPI-generated client). Zustand for client-only UI state (editor drafts, selection, modal state).
- **Auth**: Keycloak via OIDC PKCE (e.g. `oidc-client-ts`); tokens attached to REST + WS.
- **Realtime**: single WebSocket connection to BFF; events dispatched into TanStack Query cache (e.g. invalidate run on `run.completed`).
- **Editor**: Monaco for Custom Functions, with TypeScript declarations for `faker`, `rng`, `salt`, Strategy signatures.
- **Views**:
  - Workspace / Schema / Set CRUD.
  - Visual relationship graph for References (e.g. `react-flow`) with cycle highlighting.
  - Run trigger + live progress + preview + export download.

### 3.2 API Gateway / BFF
- Single ingress for the SPA. **REST, OpenAPI-spec-first.**
  - Spec lives in `packages/types` (or `apps/bff/openapi.yaml`).
  - Server handler stubs + frontend client are generated from the spec on build.
  - Same spec doubles as external API docs when third-party access opens later.
- **WebSocket endpoint** for live updates (Run progress, future collaboration).
  - Subscribes to a Redis pub/sub channel `org:{orgId}:run:{runId}` per active client.
  - Workers publish progress events to that channel; BFF fans them out to subscribers.
- Verifies Keycloak JWT, attaches user/org context.
- Routes to internal services. Aggregates where useful.

### 3.3 Workspace Service
- Owns Workspaces, Schemas, Sets, Custom Functions.
- Validates Schemas on save: type rules, reference targets exist within the same Workspace, **and reference-cycle detection**.
- Cycle detection algorithm lives in `packages/engine` as a pure function and is imported by *both* the BFF/workspace service (canonical, blocking save) and the React SPA (live highlighting in the relationship graph). One implementation, no drift.
- Server is the source of truth: a Run is refused if the saved graph is invalid, even if the client thought it was fine.
- Persists to MongoDB.

### 3.4 Generation Engine (worker pool) — **server-side only**
- Consumes "run Set" jobs from the queue. Browser never executes generation.
- Resolves Schemas → produces rows using faker.js + Custom Functions.
- Applies Strategies (`1:1`, `random`, `evenSplit`, `custom`) for References.
- Deterministic per `Set + salt`.
- Also handles **small preview runs** (e.g. 5–10 rows) from the schema editor — same engine, fast lane on the queue.
- **Custom Function execution**: each user JS invocation runs inside a `worker_threads` Worker with a `node:vm` context. Per-call timeout, memory cap, no Node globals (`require`, `process`, `fs`) exposed. A small pool of pre-warmed workers is recycled to amortise spin-up cost.
- **Cancellation**: every Run has a Redis flag `run:{runId}:cancel`. The engine checks it between row batches; on `true`, it aborts cleanly, discards the partial artifact, and emits `run.cancelled`. The SPA exposes a Cancel button that hits a BFF endpoint which sets the flag.
- **Concurrency**: global FIFO across all orgs — no per-org throttling at this stage. Two BullMQ queues: `runs` (full) and `previews` (fast lane). Workers pull from both with `previews` weighted higher so the editor stays snappy under load. *(Per-org rate limiting flagged as a follow-up if multi-tenant load becomes uneven — see §9.)*

### 3.5 Export / Connector Service

The connector layer is an **internal extension pattern**, not a runtime plugin system. All connectors ship as part of this repo and are deployed together with the export service. Adding a new connector type is a code change + release, not a user-facing install.

**Connector contract** (in `packages/connectors`):

```ts
interface Connector {
  id: string;                            // "json", "csv", "mongo", "postgres", ...
  configSchema: JSONSchema;              // UI builds the config form from this
  validateConfig(cfg): Promise<void>;
  open(cfg, ctx): Promise<Sink>;         // returns a streaming sink
}

interface Sink {
  write(row): Promise<void>;
  close(): Promise<void>;
}
```

**Connectors shipped in-repo**: JSON, CSV, Excel, ZIP, MongoDB, PostgreSQL, Elasticsearch, Webhook. Each lives in its own sub-package under `packages/connectors/*` and is registered at service startup.

**No third-party / runtime install.** Since connectors are first-party code, we don't need plugin sandboxing, egress allow-lists, per-org enablement, marketplaces, or versioning negotiation.

**Run-time data flow**: the service reads the cached Run artifact from object storage, instantiates the selected connector's `Sink`, and streams rows through it. No buffering of full result sets.

### 3.6 Identity — Keycloak
- Realms, users, groups, tokens.
- **Org model**: Keycloak Groups represent Mirage Organisations. A user can belong to multiple orgs.
- **Roles** (per-org, per-workspace): `owner`, `editor`, `viewer`. Encoded as Keycloak roles + a thin Mirage-side membership table for per-workspace overrides.
- JWT carries: `userId`, list of `orgId`s, default org. Per-request, the client sends an explicit `X-Mirage-Org` header; services verify the user is a member.

## 4. Data Model

### 4.1 Storage split

| Store           | What goes there                                                |
| --------------- | -------------------------------------------------------------- |
| **MongoDB**     | All *definitions* and *metadata* (Workspaces, Schemas, Sets, Custom Functions, Connectors, Run records). |
| **Object storage** (S3-compatible, e.g. MinIO in dev) | Cached row output of the **most recent Run** per Set, as a single artifact (e.g. NDJSON / Parquet). Older Run artifacts are evicted. |

### 4.2 MongoDB collections (first cut)

| Collection         | Holds                                                   |
| ------------------ | ------------------------------------------------------- |
| `orgs`             | Organisation records (id, name, Keycloak group id).      |
| `memberships`      | (userId, orgId, role) and optional (userId, workspaceId, role) overrides. |
| `workspaces`       | Workspace metadata, owning `orgId`.                      |
| `schemas`          | Schema definitions (properties tree, generators).       |
| `custom_functions` | Workspace-level JS functions (source, signature).       |
| `sets`             | Set definitions: schemas included, counts, strategies, salt. |
| `connectors`       | Export targets + credentials. **Plaintext for now** — flagged for envelope encryption before any real-user release (see §9 Q7). |
| `runs`             | Run records: status, started/ended, row counts, pointer to the artifact key in object storage. |

> Per CONTEXT.md, rows are still conceptually ephemeral — the cached artifact is a re-derivable convenience, not a source of truth. Deleting it never loses data.

## 5. Testing

Explicit decision: **no automated test suites for now.** We rely on:

- The TypeScript compiler (strict mode) catching shape/contract errors.
- The OpenAPI-generated client keeping BFF↔SPA in sync.
- Manual verification while features are being built.

This is a deliberate dev-speed trade-off appropriate for the prototype phase, not a long-term policy. Once the engine, Strategy logic, and connector matrix stabilise, we should layer in:

- Vitest unit tests for the pure engine (`packages/engine`) — including Strategy semantics (`1:1`, `random`, `evenSplit`, `custom`) and determinism under a fixed salt.
- Integration tests for workspace-svc and export-svc against real Mongo / Redis / MinIO (using the same `docker-compose` infra).
- A thin Playwright smoke for the golden path (create Schema → create Set → Run → export JSON).

⚠️ Pure engine determinism and the cycle detector are high-value first tests once we re-enable testing — both are pure functions of the Schema/Set, easy to fixture, and silent regressions there would corrupt every Run.

## 6. Cross-cutting Concerns (sketch)

- **Auth**: Keycloak OIDC, JWT to all services.
- **Tenancy**: shared DB with row-level scoping.
  - Every persisted document carries `orgId` and `workspaceId`.
  - Every service request derives `orgId` from the JWT, never trusts the client.
  - Mongo indexes are compound on `(orgId, workspaceId, …)` from day one.
  - Object storage keys are prefixed `org/{orgId}/workspace/{workspaceId}/...`.
  - A central middleware in the BFF / services rejects any query missing tenant scope.
- **Inter-service comms**: REST between services + BullMQ for async runs + Redis pub/sub for progress events.
- **Job Queue**: **BullMQ on Redis**. Retries/backoff per job, separate queues for `runs` (full) and `previews` (fast lane), Bull Board mounted in dev for visibility.
- **Realtime**: WebSocket from browser to BFF; Redis pub/sub between BFF and workers.
- **Logging / tracing**: structured logs, request id propagation — out of scope for now.
- **Config**: env vars per service.

## 7. Infrastructure

### 7.1 Local development (committed to the repo)

`infra/docker-compose.yml` brings up the **infra dependencies only**. Application services (BFF, workspace-svc, generation-worker, export-svc, web) run on the host via Nx (`nx serve <app>` / `nx run-many -t serve`) for fast HMR and easy debugging.

| Container          | Image (indicative)              | Purpose                                          |
| ------------------ | ------------------------------- | ------------------------------------------------ |
| `mongo`            | `mongo:7`                       | Definitions / metadata store.                    |
| `redis`            | `redis:7-alpine`                | BullMQ queue + pub/sub for run events.           |
| `minio`            | `minio/minio`                   | S3-compatible object storage for Run artifacts.  |
| `keycloak`         | `quay.io/keycloak/keycloak:latest` | OIDC provider. Realm imported from `infra/keycloak/`. |
| `mailhog` *(opt.)* | `mailhog/mailhog`               | Catches Keycloak-sent emails in dev.             |

Each app reads `.env` files (`.env.example` committed) for connection URLs. Nothing else is required to develop locally beyond `nvm use && pnpm install`.

### 7.2 Later (not now)

Listed so we know what's coming, not to build yet:

- Container orchestration (k8s / similar).
- Reverse proxy / TLS termination (nginx / Traefik).
- Managed equivalents of the dev containers (Atlas / ElastiCache / S3 / hosted Keycloak).
- Observability stack (logs, metrics, traces).
- Secret store (for the connector-credentials encryption flagged in §9 Q7).

## 8. Repository Layout

Monorepo with **Nx + pnpm workspaces**. TypeScript end-to-end.

Nx gives us:
- A typed dependency graph across `apps/*` and `packages/*` (knows what to rebuild/test on change).
- Generators / executors for new services and libs (`nx g @nx/node:app`, `nx g @nx/react:lib`).
- Local + remote build cache (Nx Cloud optional).
- Affected commands (`nx affected -t build,test,lint`) for fast CI on a single PR.
- Module-boundary lint rules to keep `packages/*` from importing `apps/*` etc.

```
mirage/
├── apps/
│   ├── web/                 # React SPA
│   ├── bff/                 # API Gateway / BFF (REST + WS)
│   ├── workspace-svc/       # Workspace, Schema, Set, Custom Function CRUD
│   ├── generation-worker/   # Queue consumer; runs Sets; sandboxes user JS
│   └── export-svc/          # Format exports + DB/webhook connectors
├── packages/
│   ├── types/               # Shared TS types: Schema, Set, Strategy, RunEvent, ...
│   ├── engine/              # Pure generation core (faker.js + strategy resolvers). Reused by worker.
│   ├── sandbox/             # worker_threads + node:vm wrapper for Custom Functions
│   ├── connectors/          # Connector contract + all built-in connectors (json, csv, mongo, ...)
│   ├── auth/                # Keycloak JWT verify + tenancy middleware
│   └── ui-kit/              # Shared React components, design tokens
├── infra/
│   └── docker-compose.yml   # Dev: Mongo, Redis, MinIO, Keycloak
├── docs/
├── .nvmrc                   # lts/krypton — Node 24 Active LTS, locked
├── package.json             # `engines.node` mirrors .nvmrc
└── pnpm-workspace.yaml
```

Shared `@mirage/types` is the contract between services. The engine is a pure library (no I/O) so it's trivially testable and reusable by the worker.

## 9. Open Questions (driving the next iterations)

1. ~~Where does generation run?~~ **Decided: server-side workers only.** Browser triggers/monitors; small previews use a "fast lane" on the same worker pool.
2. ~~Custom Function sandboxing.~~ **Decided: `worker_threads` + `node:vm`.** Each Custom Function invocation context runs inside a dedicated Worker thread with a `vm.Context`; timeouts and memory caps enforced per worker. No native deps; revisit isolation hardening if we open to untrusted users.
3. ~~Are Runs persisted at all?~~ **Decided: latest Run per Set cached in object storage; older artifacts evicted. Run metadata persisted in Mongo.**
4. ~~Multi-tenancy model.~~ **Decided: shared MongoDB + shared bucket, row-level scoping by `orgId` / `workspaceId`.**
5. **Streaming exports.** Engine writes rows as a stream (NDJSON) to object storage; export service streams from storage to sinks. No in-memory buffering of full result sets. *(Locked in as a principle — implementation detail.)*
6. ~~Real-time collaboration~~ **Decided: last-write-wins with a soft lock indicator.** When a user opens a Schema/Set editor, BFF broadcasts "Alice is editing X" over the existing WS channel; other clients show a banner but aren't blocked. No CRDT.
7. ~~Connector credentials~~ **Decided for dev: plaintext in Mongo.** ⚠️ **Must encrypt** (envelope encryption or Vault) before exposing to real users / non-dev environments. Tracked as a release-blocking task.
8. ~~Monorepo vs polyrepo.~~ **Decided: monorepo, Nx + pnpm workspaces.**

9. ~~Plugin distribution / per-org enablement / manifests / versioning.~~ **All resolved by the in-repo decision: connectors are first-party code shipped with the application.** No 3rd-party install, no per-org enablement, no manifest format, no plugin versioning.
10. ~~Run cancellation.~~ **Decided: cancellable via Redis flag, polled between row batches.**
11. ~~Concurrency model.~~ **Decided: global FIFO for v1.** Two queues (`runs`, `previews`) with weighted pulling. ⚠️ Revisit per-org rate limits once we have real multi-tenant traffic.

