# Custom Functions CRUD — Design

> Date: 2026-05-20
> Status: Approved (brainstorming complete, plan pending)
> Scope: Sub-project 2 of 4 in the "Sets end-to-end" initiative.

## Context

Mirage now has full CRUD for Workspaces, Schemas, and Sets. The next missing piece is **Custom Functions** — user-written JavaScript that can be used as a Value Generator on a Schema property or as a Strategy on a Set Reference (CONTEXT.md).

The scaffolding already exists:
- The `CustomFunction` type in [packages/types/src/custom-function.ts](../../../packages/types/src/custom-function.ts) and the branded `CustomFunctionId` in [branded.ts](../../../packages/types/src/branded.ts).
- A `CustomFunctionRegistry` interface in [packages/engine/src/custom-function-registry.ts](../../../packages/engine/src/custom-function-registry.ts).
- A Monaco editor proof-of-concept in [apps/web/src/pages/Scratch.tsx](../../../apps/web/src/pages/Scratch.tsx).
- The Schema `ValueGenerator` discriminated union and the Set `CustomStrategy` interface in [schema.ts](../../../packages/types/src/schema.ts) and [set.ts](../../../packages/types/src/set.ts).

But none of these are wired together: there is no Functions UI, the workspace-svc has no `/custom-functions` routes, the Schema property editor only offers faker methods and `$ref`, and the Set StrategiesTab disables the "custom" strategy with a "coming soon" tooltip.

This slice fills that gap and re-enables the "custom" option in both editors. **Execution** of the saved JavaScript is still out of scope — the sandbox stays stubbed until sub-project 3.

## Sub-project plan (context for this spec)

This sub-project sits between the Sets CRUD slice that just landed and the engine + sandbox + run pipeline that comes next:

1. ✅ Sets CRUD.
2. **Custom Functions CRUD** ← this spec.
3. Real generation engine + sandbox.
4. Run pipeline + UI.

## Goals

- Users can list, create, edit, and delete Custom Functions in a Workspace from a new top-level **Functions** page.
- The Schema property editor's Value Generator picker offers a third choice — **Custom function** — with a searchable dropdown filtered to functions usable as a generator.
- The Set StrategiesTab's "Custom function" tile becomes selectable and bound to functions usable as a strategy.
- Saving a function rejects invalid JavaScript (parse-only, never executed).
- Deleting a function is blocked if any Schema or Set still references it.
- Narrowing a function's `usage` is blocked if any referrer relies on the call site being removed.

## Non-goals

- Executing the function (lands with the sandbox in sub-project 3).
- A "Test" / "Run preview" button in the editor.
- Server-side autoformatting (Monaco's built-in shortcut is enough).
- Version history / inline diff.
- TypeScript source. The saved source is always JavaScript; the editor adds type hints via Monaco's `addExtraLib` but the file is still JS.

## Vocabulary

This spec uses the names defined in [docs/CONTEXT.md](../../CONTEXT.md): **Custom Function**, **Value Generator**, **Strategy**. The TypeScript identifier on the wire is `CustomFunction` (singular). Branded ids are `CustomFunctionId`.

## Data model

### OpenAPI additions ([packages/types/openapi.yaml](../../../packages/types/openapi.yaml))

```yaml
CustomFunction:
  type: object
  required:
    - id, workspaceId, orgId, name, description, usage, source
    - createdBy, createdAt, updatedAt
  additionalProperties: false
  properties:
    id: { type: string }
    workspaceId: { type: string }
    orgId: { type: string }
    name:
      type: string
      pattern: '^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$'    # JS-identifier shape
    description: { type: string, maxLength: 500 }
    usage: { type: string, enum: [valueGenerator, strategy, both] }
    source: { type: string, minLength: 1, maxLength: 20000 }
    createdBy: { type: string }
    createdAt: { type: string, format: date-time }
    updatedAt: { type: string, format: date-time }

CreateCustomFunctionBody:
  required: [name, usage, source]
  additionalProperties: false
  properties:
    name: { type: string, pattern: '^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$' }
    description: { type: string, maxLength: 500 }
    usage: { type: string, enum: [valueGenerator, strategy, both] }
    source: { type: string, minLength: 1, maxLength: 20000 }

UpdateCustomFunctionBody:
  required: [name, usage, source, expectedUpdatedAt]
  additionalProperties: false
  properties:
    name: { type: string, pattern: '^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$' }
    description: { type: string, maxLength: 500 }
    usage: { type: string, enum: [valueGenerator, strategy, both] }
    source: { type: string, minLength: 1, maxLength: 20000 }
    expectedUpdatedAt: { type: string, format: date-time }
```

### Strategy union extension

Add a fourth variant to the existing `Strategy` oneOf in the OpenAPI spec:

```yaml
- type: object
  required: [type, functionId]
  additionalProperties: false
  properties:
    type: { type: string, enum: ['custom'] }
    functionId: { type: string }
```

### Schema property integration

No OpenAPI shape change. The existing `faker` string field on `SchemaProp` is reused to hold a new third sentinel: **`$fn:<functionId>`**. The string can now hold one of:

- A faker.js method path, e.g. `person.firstName`.
- A cross-schema reference, e.g. `$ref:person.id`.
- A custom function reference, e.g. `$fn:cfn_abc123def`.

This matches the existing `$ref:` convention and keeps the Schema data shape stable.

### MongoDB

New collection `custom_functions` declared in [apps/workspace-svc/src/db.ts](../../../apps/workspace-svc/src/db.ts). Indexes:

| Index | Purpose |
|---|---|
| `{ workspaceId: 1, name: 1 }` unique | Uniqueness of name per workspace |
| `{ workspaceId: 1, updatedAt: -1 }` | List endpoint sort |
| `{ orgId: 1, workspaceId: 1 }` | Tenant scoping |

`CustomFunctionDoc` is `Api.components['schemas']['CustomFunction']` — same trick as `SchemaDoc` and `SetDoc`.

Function ids are minted as `cfn_<nanoid(16)>` — readable prefix to make `$fn:` references self-documenting.

## Backend

### Reference detection (extend [@mirage/engine](../../../packages/engine/))

A new pure helper next to `extractSetEdges`:

```ts
// packages/engine/src/extract-fn-refs.ts
export interface FnRef {
  schemaKey: string;
  fieldPath: string;        // same dotted form used by extractSetEdges
  functionId: string;
}

export function extractFnRefs(schemas: ReadonlyArray<Schema>): FnRef[];
```

Walks every schema's property tree, returns one `FnRef` per `$fn:<id>` found. Used by the workspace-svc on Function update/delete to find affected schemas, and by the SPA's "Used by" panel.

A second helper for sets is trivial enough to inline in the route (a flat `setDoc.strategies.filter(...)` walk).

### workspace-svc routes ([apps/workspace-svc/src/routes/custom-functions.ts](../../../apps/workspace-svc/src/routes/custom-functions.ts))

Mirrors the existing CRUD patterns (`resolveWorkspace`, `viewer` role denial on writes, OCC).

| Method | Path | Notes |
|---|---|---|
| `GET` | `/workspaces/:wsId/custom-functions` | List. Supports `?usage=valueGenerator\|strategy\|both` filter — when set, returns functions whose `usage` matches the filter exactly, **plus** those marked `both`. |
| `GET` | `/workspaces/:wsId/custom-functions/:id` | Single function. |
| `POST` | `/workspaces/:wsId/custom-functions` | Viewer 403; 201 with new doc. |
| `PUT` | `/workspaces/:wsId/custom-functions/:id` | OCC via `expectedUpdatedAt`; usage-narrowing checks below. |
| `DELETE` | `/workspaces/:wsId/custom-functions/:id` | Blocked if referenced; checks below. |

#### Validation on save

- `name` matches `^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$`, unique per workspace.
- `description` ≤500 chars.
- `usage` ∈ enum.
- `source` non-empty, ≤20 000 chars.
- **JS syntax check**: server runs `new Function('ctx', source)` inside a try/catch. On `SyntaxError`, returns 400 `invalid_js` with the parser's message in `detail.error`. **The function is never invoked** — `new Function` only parses.

#### Usage-narrowing checks on update

If `usage` is changing from `both` → `valueGenerator`:
- Scan all sets in the workspace for `strategies[].strategy.type === 'custom' && strategy.functionId === id`. If any → 400 `usage_in_use_as_strategy` with `detail.setKeys`.

If `usage` is changing from `both` → `strategy`:
- Use `extractFnRefs` against all workspace schemas; if any ref matches this function id → 400 `usage_in_use_as_generator` with `detail.schemaKeys`.

If `usage` is changing from `valueGenerator` → `strategy` (or vice versa): both checks run.

#### Delete check

- `extractFnRefs(workspaceSchemas)` — if any matches this id → 400 `ref_in_use_by_schema` with `detail.schemaKeys`.
- Scan sets for `strategy.type === 'custom' && strategy.functionId === id` — if any → 400 `ref_in_use_by_set` with `detail.setKeys`.

#### Schema save extension

In [routes/schemas.ts](../../../apps/workspace-svc/src/routes/schemas.ts):

- Extend the existing `collectRefs` helper (or add a sibling `collectFnRefs` — implementation choice) to find `$fn:<id>` references.
- After existing ref-target validation, validate every function reference: target exists in this workspace, and the function's `usage ∈ {valueGenerator, both}`. Errors:
  - `fn_target_missing` with `detail.path` and `detail.functionId`.
  - `fn_usage_mismatch` when the function exists but `usage === 'strategy'`.
- This runs in both POST and PUT.

#### Set save extension

In [routes/sets.ts](../../../apps/workspace-svc/src/routes/sets.ts):

- For each `strategy.type === 'custom'` override, validate `functionId` exists with `usage ∈ {strategy, both}`. Errors mirror the schema side: `fn_target_missing` and `fn_usage_mismatch`.
- This runs in both POST and PUT after the existing `pruneOrphanOverrides` step.

#### No rename cascades

Function refs are by ID. Renaming a function's `name` does not affect any referrer.

### BFF proxy ([apps/bff/src/routes/custom-functions.ts](../../../apps/bff/src/routes/custom-functions.ts))

Same `forward()` pattern as [sets.ts](../../../apps/bff/src/routes/sets.ts). Routes mounted:

- `GET /workspaces/:wsId/custom-functions` (preserves `?usage=` querystring)
- `GET /workspaces/:wsId/custom-functions/:id`
- `POST /workspaces/:wsId/custom-functions`
- `PUT /workspaces/:wsId/custom-functions/:id`
- `DELETE /workspaces/:wsId/custom-functions/:id`

## Frontend

### Routing & navigation

- Add `/workspaces/:wsId/functions` to [router.tsx](../../../apps/web/src/router.tsx) under the `AppShell` route.
- Add a **Functions** item to the dashboard sidebar between Sets and Graph. Icon: `Code2` (Lucide).

### File layout

```
apps/web/src/pages/dashboard/FunctionsPage.tsx          ← new, router-level entry
apps/web/src/pages/dashboard/functions/
  lib/
    types.ts                re-exports Api 'CustomFunction' as CustomFunction, plus Create/Update
    monacoTypes.ts          ambient .d.ts string for ctx.faker, ctx.rng, ctx.salt, strategy ctx
    validate.ts             client preflight (mirrors server)
    mapServerError.ts       maps { code, message } → field-targeted UI errors
  useFunctionBuffer.ts      draft + dirty tracking + reset (same shape as useSetBuffer)
  ListPane.tsx              left column: name, usage chip, updated-at
  EditPane.tsx              middle: name/description/usage controls + Monaco + SaveBar
  UsagePane.tsx             right column: "Used by" — schemas + sets that ref this function
  CreateFunctionModal.tsx   single-screen modal (no wizard)
```

`FunctionsPage.tsx` mirrors the [SchemasPage.tsx](../../../apps/web/src/pages/dashboard/SchemasPage.tsx) shape — `?active=<id>` URL state, dirty-aware navigation, discard-changes modal.

### EditPane

- Top section: `name` (text input, identifier-validated), `description` (text), `usage` (3-way segmented control: Value generator / Strategy / Both)
- Monaco editor (`@monaco-editor/react`, `language: 'javascript'`, `vs-dark` theme), full-height under the controls
- Ambient `.d.ts` registered once on mount via `monaco.languages.typescript.javascriptDefaults.addExtraLib`:

```typescript
// (lib content lives in apps/web/src/pages/dashboard/functions/lib/monacoTypes.ts)
declare const ctx: ValueGeneratorContext;
interface ValueGeneratorContext {
  faker: import('@faker-js/faker').Faker;
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
```

We declare the `faker` import as a `declare const ctx: …` line in the SAME extra-lib blob, so users get autocompletion on `ctx.faker.<namespace>.<method>` without a real `@faker-js/faker` install in the SPA. The actual faker bindings come from sub-project 3 at run time.

- Sticky SaveBar at the bottom (Discard / Save changes), reused pattern from the Sets DetailPane. Shows server errors inline with `mapServerError`.

### UsagePane

Right column. Queries:

```typescript
useQuery({ queryKey: ['schemas', wsId], … })
useQuery({ queryKey: ['sets', wsId], … })
```

Computes locally using `extractFnRefs` from `@mirage/engine` (newly exposed) + a flat scan over set strategies:

- "Used by schemas (N)" — each row shows schema icon, schema name, and the dotted field path. Clicking navigates to `/workspaces/:wsId/schemas?active=<schemaId>`.
- "Used by sets (N)" — each row shows set icon, set name, and the edge it customises. Clicking navigates to `/workspaces/:wsId/sets?active=<setId>`.
- Empty state: "Not used yet — pick this in a schema's Value generator picker or a set's Strategies tab."

This panel doubles as the user-facing answer to "can I delete this safely?"

### CreateFunctionModal

Single-screen form (no wizard — schemas/sets benefit from steps because they have nested data; functions don't):

- `name` (live-validated against server for uniqueness, same 250 ms debounce pattern as Schema/Set creation)
- `description` (optional)
- `usage` segmented control (defaults to **Value generator** — the most common case)
- Monaco editor pre-populated with a usage-appropriate starter:
  - `valueGenerator` / `both`: `// Return a value. ctx.faker, ctx.rng(), ctx.salt are available.\nreturn ctx.faker.person.firstName();`
  - `strategy`: `// ctx.sourceRows, ctx.targetRows, ctx.cardinality, ctx.rng, ctx.salt.\nreturn ctx.sourceRows.map(() => ctx.targetRows[0].id);`
- Submit → POST → on success, redirect to `/workspaces/:wsId/functions?active=<id>`.

### Schema editor integration

Touched: [apps/web/src/pages/dashboard/schemas/EditPane/PropertyEditor/](../../../apps/web/src/pages/dashboard/schemas/EditPane/PropertyEditor/) and [apps/web/src/pages/dashboard/schemas/CreateSchemaSheet/Step2Builder.tsx](../../../apps/web/src/pages/dashboard/schemas/CreateSchemaSheet/Step2Builder.tsx) (if it owns the Value Generator picker).

- The Value Generator picker currently offers two choices: Faker method, or `$ref` to another schema. Add a third: **Custom function**.
- Selecting it opens a searchable dropdown of workspace functions filtered to `usage ∈ {valueGenerator, both}` (use the `?usage=valueGenerator` query). Each row: function name, tiny "VG" or "both" chip, optional description preview.
- Selecting a function sets the property's `faker` string to `$fn:<id>`.
- Clearing the choice returns to the default state (no faker — same as today).
- Identification of a current `$fn:` value is handled in the existing `faker` parser (look for the prefix, render the picker pre-selected, show the function name from a side-loaded query).

### Set StrategiesTab integration

Touched: [apps/web/src/pages/dashboard/sets/StrategiesTab.tsx](../../../apps/web/src/pages/dashboard/sets/StrategiesTab.tsx).

- Replace the disabled "Custom function — coming soon" tile with a real interactive tile.
- Selecting it opens an inline picker (similar pattern to the Schema editor's): searchable dropdown of functions filtered to `usage ∈ {strategy, both}`. Selecting a function persists `strategy: { type: 'custom', functionId }` to the buffer; the SaveBar handles persistence as already designed.
- The active-strategy summary on the edge list shows the function's name when applicable.

### Loading / empty states

- Workspace with 0 functions → Functions page renders a centered empty state with primary "New function" button.
- List loading → "Loading functions…".
- Schema/Set Custom-function pickers with 0 eligible functions → a small inline link "Create one →" that opens the Functions page in a new tab (target `_blank`) or routes inline — implementation choice.

## Testing

Per [TECH_ARCHITECHRE.md §5](../../TECH_ARCHITECHRE.md) the repo has no automated test suite. Verification is `nx run-many -t typecheck,lint` and a manual smoke covering:

- Create a function, edit it, save, reload — persistence works.
- Reference it from a schema property → save the schema → server accepts.
- Try to delete the referenced function → 400 with the referring schema key.
- Change `usage` from `both` to `strategy` → 400 `usage_in_use_as_generator`.
- Reference the function from a set's Strategy → save the set → server accepts.
- Delete a non-referenced function → 204.
- Edit a function with invalid JS (`return ((;`) → 400 `invalid_js`, source not saved.

## Out of scope (revisited)

- Running the function. The sandbox stays stubbed until sub-project 3.
- A "Run preview" / "Test" button.
- Server-side autoformatting.
- Version history.
- TypeScript source. The saved source is JavaScript; the editor adds type hints via Monaco's `addExtraLib` but the file is plain JS.
- Custom function libraries / imports across workspaces.
