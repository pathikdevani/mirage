# Sets CRUD — Design

> Date: 2026-05-20
> Status: Approved (brainstorming complete, plan pending)
> Scope: Sub-project 1 of 4 in the larger "Sets end-to-end" initiative.

## Context

Mirage already has full CRUD for **Schemas** (OpenAPI spec → workspace-svc routes → BFF proxy → SPA list / create wizard / edit pane). The next user-facing concept defined in [docs/CONTEXT.md](../../CONTEXT.md) is the **Set** — a saved recipe that combines one or more Schemas with per-schema record counts, a Strategy for each cross-Schema Reference, and a deterministic salt.

The visual design for Sets ships in [design/screens_export/Pieces.jsx](../../../design/screens_export/Pieces.jsx) — list grid, detail with Configuration / Strategies / Preview tabs.

This spec covers the CRUD slice only. Generation (running a Set to produce rows) is a separate sub-project that depends on the engine + sandbox + run pipeline being real (all currently stubbed).

## Sub-project plan (context for this spec)

The full "Sets end-to-end" work is decomposed into four sub-projects that ship in order:

1. **Sets CRUD** ← this spec. Visible UI, real persistence, no generation.
2. **Custom Functions CRUD.** Workspace-level JS functions used by Schemas (Value Generator) and Sets (custom Strategy).
3. **Real generation engine + sandbox.** `resolveSchema`, `applyStrategy` for `1:1` / `random` / `evenSplit`, Custom Function execution in `worker_threads` + `node:vm`.
4. **Run pipeline + UI.** BullMQ jobs, NDJSON artifacts in MinIO, WebSocket progress, Run / Preview UI activation.

What this spec defers to later sub-projects is stated in §10.

## Goals

- Users can list, create, edit, and delete Sets within a Workspace.
- Sets persist in MongoDB and are scoped by `(orgId, workspaceId)` like every other Mirage entity.
- The Strategies tab in the Set detail surfaces every cross-Schema reference between included Schemas and lets the user pick a Strategy for each.
- Schema rename + delete cascades stay correct — renaming a Schema's key rewrites every Set that references it; deleting a Schema referenced by a Set is rejected.
- No row generation in this slice. The Run button is rendered but disabled.

## Non-goals

- Running a Set to produce rows.
- Custom Strategies (require sub-project 2).
- Per-schema filters / constraints (the design's "Filters" chips are dropped — CONTEXT.md does not define filters; deferred to a future spec).
- Real-time collaboration / soft locks on Set editing.
- Exporting a Set (covered by sub-project 4 + the existing export-svc).

## Vocabulary

This spec uses the names defined in [docs/CONTEXT.md](../../CONTEXT.md): **Set**, **Schema**, **Reference**, **Strategy**, **Run**. One TS-only concession kept from `packages/types`: the Set type is exported as `MirageSet` to avoid colliding with `Set<T>`; this is invisible to the OpenAPI spec where the concept is just `Set`.

Identifiers: Schemas are referenced from Sets by **`schemaKey`** (the lower-case slug, e.g. `person`), not by `schemaId`. This matches the existing `$ref:<key>(.field)?` convention used inside Schema property trees, keeps Set documents human-readable, and reuses the rename-cascade machinery already implemented for schema keys.

## Data model

### OpenAPI additions ([packages/types/openapi.yaml](../../../packages/types/openapi.yaml))

```yaml
Strategy:
  oneOf:
    - type: object
      required: [type]
      additionalProperties: false
      properties:
        type: { const: '1:1' }
    - type: object
      required: [type]
      additionalProperties: false
      properties:
        type: { const: 'random' }
        allowDuplicates: { type: boolean }
    - type: object
      required: [type]
      additionalProperties: false
      properties:
        type: { const: 'evenSplit' }

StrategyOverride:
  type: object
  required: [schemaKey, fieldPath, strategy]
  additionalProperties: false
  properties:
    schemaKey: { type: string }
    fieldPath: { type: string }     # dotted; '[]' between array property names
    strategy: { $ref: '#/components/schemas/Strategy' }

SetSchemaInclusion:
  type: object
  required: [schemaKey, count]
  additionalProperties: false
  properties:
    schemaKey: { type: string }
    count: { type: integer, minimum: 0, maximum: 10000000 }

SetOutputConfig:
  type: object
  required: [format, locale, workerPool]
  additionalProperties: false
  properties:
    format: { type: string, enum: [json, ndjson, csv, sql, parquet] }
    locale: { type: string, minLength: 2, maxLength: 16 }
    workerPool: { type: integer, minimum: 1, maximum: 64 }

Set:
  type: object
  required:
    - id, workspaceId, orgId, key, name, description, color, icon, tags
    - salt, schemas, strategies, output, createdBy, createdAt, updatedAt
  additionalProperties: false
  properties:
    id: { type: string }
    workspaceId: { type: string }
    orgId: { type: string }
    key: { type: string, pattern: '^[a-z][a-z0-9-]{0,39}$' }
    name: { type: string, minLength: 1, maxLength: 80 }
    description: { type: string, maxLength: 500 }
    color: { type: string, enum: [violet, cyan, emerald, amber, rose, slate] }
    icon: { type: string }
    tags: { type: array, items: { type: string } }
    salt: { type: string, minLength: 1, maxLength: 64 }
    schemas:
      type: array
      minItems: 1
      items: { $ref: '#/components/schemas/SetSchemaInclusion' }
    strategies:
      type: array
      items: { $ref: '#/components/schemas/StrategyOverride' }
    output: { $ref: '#/components/schemas/SetOutputConfig' }
    createdBy: { type: string }
    createdAt: { type: string, format: date-time }
    updatedAt: { type: string, format: date-time }

CreateSetBody:
  required: [key, name, color, icon, tags, salt, schemas, strategies, output]
  # same fields as Set minus id/workspaceId/orgId/createdBy/createdAt/updatedAt

UpdateSetBody:
  required: [...CreateSetBody, expectedUpdatedAt]
  # expectedUpdatedAt: { type: string, format: date-time }  — for optimistic concurrency

SetEdge:                          # only returned by GET /sets/:id/edges
  type: object
  required: [fromSchemaKey, fromFieldPath, toSchemaKey, cardinality]
  additionalProperties: false
  properties:
    fromSchemaKey: { type: string }
    fromFieldPath: { type: string }
    toSchemaKey: { type: string }
    cardinality: { type: string, enum: [one, many] }
```

### MongoDB

New collection `sets` declared in [apps/workspace-svc/src/db.ts](../../../apps/workspace-svc/src/db.ts). Indexes (idempotent on connect, like all other collections):

| Index | Purpose |
|---|---|
| `{ workspaceId: 1, key: 1 }` unique | uniqueness of key per workspace |
| `{ workspaceId: 1, updatedAt: -1 }` | list endpoint sort |
| `{ orgId: 1, workspaceId: 1 }` | tenant scoping |

`SetDoc` is `Api.components['schemas']['Set']` (same trick as `SchemaDoc`).

## Backend

### Edge computation (`packages/engine`)

A new pure function lives next to the cycle detector:

```ts
// packages/engine/src/extract-set-edges.ts
export interface SetEdge {
  fromSchemaKey: string;
  fromFieldPath: string;   // dotted; '[]' between array names
  toSchemaKey: string;
  cardinality: 'one' | 'many';
}

export function extractSetEdges(
  schemas: Schema[],          // workspace schemas (the ones included)
  includedKeys: ReadonlySet<string>,
): SetEdge[];
```

Walks each included schema's property tree, finds every `$ref:<targetKey>(...)` whose `targetKey ∈ includedKeys`, and emits an edge. Cardinality is `'many'` iff the ref appears at or under any `array` ancestor; otherwise `'one'`. Properties outside `includedKeys` are silently skipped (they're not edges *within this Set*).

This function is the single source of truth for edges — server uses it in `GET .../edges` and in validation; SPA imports it (the engine is allowed in the web app per the module boundary rules — pure, no Node-only deps).

### workspace-svc routes ([apps/workspace-svc/src/routes/sets.ts](../../../apps/workspace-svc/src/routes/sets.ts))

Mirrors the existing [schemas.ts](../../../apps/workspace-svc/src/routes/schemas.ts) pattern: `resolveWorkspace` helper, `viewer` role denial on writes, OCC on update via `expectedUpdatedAt`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/workspaces/:wsId/sets` | list, `sort: { updatedAt: -1 }`, `limit: 500` |
| `GET` | `/workspaces/:wsId/sets/:id` | single set, 404 if missing or out of org |
| `GET` | `/workspaces/:wsId/sets/:id/edges` | returns `SetEdge[]` computed from current schemas |
| `POST` | `/workspaces/:wsId/sets` | create, viewer 403, 201 with the new doc |
| `PUT` | `/workspaces/:wsId/sets/:id` | update, viewer 403, OCC 409 on stale, 200 with new doc |
| `DELETE` | `/workspaces/:wsId/sets/:id` | viewer 403, 204 on success |

#### Validation (`normalizeAndValidateSetBody`)

- `key` matches `^[a-z][a-z0-9-]{0,39}$` and is unique in the workspace
- `name` non-empty, ≤80 chars
- `description` ≤500 chars
- `color` in the brand palette
- `icon` non-empty
- `tags` is an array of strings
- `salt` non-empty, ≤64 chars
- `schemas` non-empty; each `schemaKey` resolves to a schema in this workspace; each `count` is an integer in `[0, 10_000_000]`
- `output.format` in enum, `output.workerPool` in `[1, 64]`, `output.locale` non-empty
- **Strategy overrides:** silently drop overrides whose `(schemaKey, fieldPath)` does not match an actual edge from `extractSetEdges` against the included schemas. This keeps the UI lenient when the underlying schemas change — orphans are pruned at next save rather than 400-ing. The validator returns the cleaned list to be persisted.

Validator errors follow the existing `{ code, message, detail? }` shape and HTTP codes used by schemas.ts (400 for validation, 409 for OCC, 403 for role, 404 for missing).

#### Cascades on schema mutation

Two changes to existing flows in [apps/workspace-svc/src/routes/schemas.ts](../../../apps/workspace-svc/src/routes/schemas.ts):

1. **Schema key rename** — extend the existing transaction's `runCascade` to also update sets:
   - `sets.schemas[].schemaKey` from old→new
   - `sets.strategies[].schemaKey` from old→new
   Both transactional in the replica-set path, sequential in the dev fallback.
2. **Schema delete** — extend the existing `ref_in_use` check to also list Set keys whose `schemas[]` includes the deleted Schema. Delete blocked if any Set still includes the Schema (matches the existing schema-referrers behaviour).

### BFF proxy ([apps/bff/src/routes/sets.ts](../../../apps/bff/src/routes/sets.ts))

Same `forward()` pattern as [apps/bff/src/routes/schemas.ts](../../../apps/bff/src/routes/schemas.ts): preserves `Authorization` + `X-Mirage-Org`, forwards body, returns upstream status + body. Routes mounted:

- `GET /workspaces/:wsId/sets`
- `GET /workspaces/:wsId/sets/:id`
- `GET /workspaces/:wsId/sets/:id/edges`
- `POST /workspaces/:wsId/sets`
- `PUT /workspaces/:wsId/sets/:id`
- `DELETE /workspaces/:wsId/sets/:id`

## Frontend

### URL state

`/workspaces/:wsId/sets` already exists in [router.tsx](../../../apps/web/src/router.tsx). The SetsPage reuses the same `?active=<setId>` search-param pattern from [SchemasPage.tsx](../../../apps/web/src/pages/dashboard/SchemasPage.tsx):

- No `?active` → list grid only
- `?active=<id>` → detail pane open (list still rendered behind in the design, but we render either-or to keep the layout simple — list when no active, detail when active)

### File layout

```
apps/web/src/pages/dashboard/SetsPage.tsx           ← rewrites the existing stub
apps/web/src/pages/dashboard/sets/
  lib/
    types.ts            re-exports Api 'Set' as MirageSet, plus Strategy / StrategyOverride / SetEdge
    colors.ts           lift-shared with schemas/lib/colors.ts (move to dashboard/lib if both consumers need it)
    icon.tsx            same — render Lucide icon by name
    edges.ts            re-export extractSetEdges from @mirage/engine; provide a tiny adapter that takes the openapi 'Schema' shape
    validateSet.ts      client-side preflight (mirrors workspace-svc validator)
    mapServerError.ts   maps { code, message } → field-targeted UI errors
  ListGrid.tsx          card grid + "New set" placeholder card (design's SetsPage)
  DetailPane.tsx        header (icon, title, salt pill, Run|disabled, overflow{Delete, Duplicate-disabled}) + tabs
  ConfigTab.tsx         schemas table (inline-edit count, add-schema picker) + Output card (format/locale/workerPool)
  StrategiesTab.tsx     edges list (left) + per-edge Strategy editor (right) with the three options
  PreviewTab.tsx        empty-state ("Run a set to see rows — coming soon")
  CreateSetSheet/
    index.tsx           orchestrator + create mutation
    SheetShell.tsx      reused-style wrapper from CreateSchemaSheet
    Step1Details.tsx    name, key (auto-slug from name, editable), description, color, icon, tags, salt + shuffle
    Step2Schemas.tsx    multi-select schemas + per-schema count
    Step3Review.tsx     summary + Create
```

`SetsPage.tsx` is the top-level page wired into the router; it owns the list / detail switching, the create sheet, and the discard-changes modal — same shape as `SchemasPage.tsx`.

### Edit semantics

- **Buffer + SaveBar.** ConfigTab and StrategiesTab both mutate one in-memory buffer (a `useSetBuffer` hook modelled on `useSchemaBuffer`). A sticky save bar at the bottom of the pane shows when `dirty`, with "Discard" and "Save changes".
- **One PUT per save.** All buffered changes go in a single `PUT /sets/:id` with `expectedUpdatedAt` from the loaded set. 409 → toast "Set was modified elsewhere", refetch, keep buffer for the user to retry.
- **Dirty-aware navigation.** `dirtyRef` lifted into `SetsPage`, same pattern as `SchemasPage`. Switching `?active`, hitting `Delete`, or closing the create sheet while dirty pops the existing `DiscardChangesModal`.
- **Salt shuffle.** Inline button regenerates a random slug into the buffer. Persists on save like every other field.

### Delete

Overflow menu in DetailPane → "Delete set" → confirmation dialog → `DELETE /sets/:id` → on success: clear `?active`, refetch list. Per-card overflow in ListGrid hits the same flow.

### Strategy editor

Three options rendered as the design's option cards:

- **`1:1`** — extra field: "On missing target" (re-roll source / skip row / use null). This is a UI-only field for now; the engine sub-project decides whether to honour it. Stored on the override under `strategy.onMissingTarget?` — *deferred*: not in v1 OpenAPI, will be added with sub-project 3.
- **`random`** — extra field: `allowDuplicates` checkbox (only meaningful when the edge cardinality is `many`).
- **`evenSplit`** — no extra fields.
- **`custom`** option visible but disabled with tooltip "Requires Custom Functions — coming soon".

For v1 the Strategy union stores only `{ type, allowDuplicates? }`. The "on missing target" field is rendered greyed-out with a "Available once generation is wired" hint — keeps the design intact without committing to engine semantics we haven't built.

### Run / Preview

- **Run button** in DetailPane header: rendered, `disabled`, tooltip "Generation pipeline coming soon".
- **Preview tab**: empty state with the same message + a small explainer.

### Empty / loading states

- Workspace with 0 sets → centred empty state with primary "New set" button (matches schemas).
- List loading → "Loading sets…"
- Detail loading → spinner in the detail pane only.

## Testing approach

Per [TECH_ARCHITECHRE.md §5](../../TECH_ARCHITECHRE.md), no automated tests in this phase. Verification:

- `nx run-many -t typecheck,lint --skip-nx-cache` — green across all touched projects.
- `prettier --check` — clean.
- Manual smoke (documented in the implementation plan): docker-compose up → create a set via the wizard → schema with cross-ref → edge appears in Strategies tab → strategy saves → reload → strategy persists → rename a referenced schema → set updates → delete the referenced schema → 400 with `ref_in_use` listing the set.

## Out of scope (revisited)

- Running a Set → sub-project 4.
- Custom Functions → sub-project 2.
- Custom Strategy code editor → sub-project 2 + 3.
- Per-schema filters / constraints → future spec; design's filter chips are deliberately not rendered.
- Real-time collaboration on Set editing → not before §9 in [TECH_ARCHITECHRE.md](../../TECH_ARCHITECHRE.md) is reopened.
- Duplicate Set action → deferred to sub-project 4 (trivial server endpoint but no urgency).
- `onMissingTarget` for `1:1` and any other strategy-config fields → deferred to sub-project 3 alongside the real engine semantics.
