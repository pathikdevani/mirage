# Mirage

Web-UI-driven fake data generation tool. Define data shapes (Schemas), bundle them into Sets, produce realistic synthetic records on demand. See [PRODUCT.md](PRODUCT.md), [CONTEXT.md](CONTEXT.md), and [TECH_ARCHITECHRE.md](TECH_ARCHITECHRE.md) for product vision, vocabulary, and technical architecture.

Bootstrap progress and remaining tasks live in [BOOTSTRAP_PLAN.md](BOOTSTRAP_PLAN.md).

## Stack

Node 24 (`lts/krypton`), pnpm workspaces + Nx, TypeScript strict end-to-end. React 19 SPA via Vite + Tailwind v4 + shadcn. Fastify services. MongoDB, Redis (BullMQ), MinIO, Keycloak.

## Local bring-up

```bash
# 1. Use the right Node version
nvm use

# 2. Install + run OpenAPI codegen (auto-runs on postinstall)
pnpm install

# 3. Bring up infra (Mongo, Redis, MinIO, Keycloak, MailHog)
docker compose -f infra/docker-compose.yml up -d

# 4. Run every app in parallel (web + bff + workspace-svc + generation-worker + export-svc)
pnpm dev
```

| Surface | URL |
| --- | --- |
| Web SPA | http://localhost:5173 |
| BFF | http://localhost:4000 |
| workspace-svc | http://localhost:4001 |
| export-svc | http://localhost:4002 |
| Keycloak | http://localhost:8080 (admin / admin) |
| MinIO console | http://localhost:9001 (miragedev / miragedev-secret) |
| MailHog | http://localhost:8025 |

Default Keycloak login for the realm `mirage`: **`dev`** / **`dev`** (member of group `/acme`). Set the org switcher in the web SPA to `acme`.

## Useful commands

```bash
pnpm dev                    # serve every app in parallel
pnpm build                  # build every app (web today; servers run via tsx)
pnpm typecheck              # nx run-many -t typecheck
pnpm lint                   # nx run-many -t lint
pnpm gen:openapi            # regenerate packages/types/src/openapi.generated.ts
pnpm format                 # prettier --write .
pnpm exec nx graph          # visual dependency graph
```

To serve a single app:

```bash
pnpm exec nx run @mirage/bff:serve
pnpm exec nx run @mirage/web:serve
```

## Repo layout

```
mirage/
├── apps/
│   ├── web/                  React SPA (Vite + shadcn)
│   ├── bff/                  API Gateway (Fastify + WebSocket)
│   ├── workspace-svc/        Workspace / Schema / Set CRUD (Fastify + Mongo)
│   ├── generation-worker/    BullMQ consumer (Sets → rows, sandboxed user JS)
│   └── export-svc/           Connector dispatch + streaming exports (Fastify + S3)
├── packages/
│   ├── types/                Shared TS types + OpenAPI spec + generated client types
│   ├── engine/               Pure generation core (faker + Strategy resolvers, cycle detector)
│   ├── sandbox/              worker_threads + node:vm wrapper for Custom Functions
│   ├── connectors/           Connector contract + JSON connector + stubs for csv/mongo/...
│   ├── auth/                 Keycloak JWT verify + tenancy middleware (incl. Fastify plugin)
│   └── ui-kit/               Tailwind v4 theme + shadcn cn() helper
└── infra/
    ├── docker-compose.yml    Mongo, Redis, MinIO, Keycloak, MailHog
    └── keycloak/             Realm import (mirage realm + dev user)
```
