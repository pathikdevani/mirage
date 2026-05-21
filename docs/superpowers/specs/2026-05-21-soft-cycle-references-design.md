# Soft cycle references — design

**Date:** 2026-05-21
**Status:** Draft

## Problem

The cycle detector in [apps/workspace-svc/src/routes/schemas.ts](../../../apps/workspace-svc/src/routes/schemas.ts) and the engine ([packages/engine/src/topology.ts](../../../packages/engine/src/topology.ts), [packages/engine/src/plan-run-set.ts](../../../packages/engine/src/plan-run-set.ts)) currently rejects **every** schema-level reference cycle, even when the cycle is only formed by scalar `$ref:<other>.<field>` projections that materialise to independent UUIDs.

Concretely, this schema pair is rejected today although the resulting rows would be entirely safe (two scalar IDs cross-pointing):

```text
Phone   { id: uuid,  person_id: $ref:person.id }
Person  { id: uuid,  phone_id:  $ref:phone.id  }
```

We need to allow cross-references like this to save and to generate, while keeping the detector strict for cases that would genuinely deadlock or recurse infinitely.

## Goal

1. Allow schema-level cycles when every edge in the cycle is a scalar field projection that bottoms out in a primitive value.
2. Reject cycles when any edge would embed an entire row (`$ref:other` with no field projection).
3. Reject cycles where field-projection chains close on themselves (true field-level deadlock).
4. Generate rows correctly at run-time for allowed cycles, producing scalar IDs that cross-point.

## Non-goals

- Supporting nested-object embedding (`$ref:other` without `.field`) inside cycles. Such cycles will continue to fail.
- Allowing soft cycles where the projected field itself uses a custom Strategy override that breaks determinism (treat as hard for now).
- Changing the wire shape of stored Schemas. Only validation and engine-internal classification change.

## Definitions

| Term | Meaning |
|---|---|
| **Edge** | An ordered pair `(fromSchema.fromField → toSchema.toField?)` derived from a `$ref:` in a Schema property's `faker` string. |
| **Hard edge** | An edge that genuinely creates a data dependency from source to target. |
| **Soft edge** | An edge that resolves to an independent scalar at run-time; ignored for cycle detection. |
| **Anchor field** | A field on a cycle-member schema whose value is computed without reading any other schema (i.e. a primitive faker call or literal). |

## Edge classification rules

For each `$ref` of the form `$ref:<targetKey>(.<targetField>)?` found in a schema property:

1. **No field projection** (`$ref:<targetKey>`) → **hard**.
   Semantics: embed the full target row. Any cycle through this edge would require infinite nesting.
2. **Field projection** (`$ref:<targetKey>.<targetField>`):
   - Resolve `<targetKey>.<targetField>` against the workspace's other schemas.
   - If `<targetField>` is **primitive** (any non-`$ref` faker, literal, or empty string), the edge is **soft**.
   - If `<targetField>` is itself a `$ref:` to another schema, follow that chain transitively.
     - If the chain reaches a primitive → **soft**.
     - If the chain returns to a field that is currently on the active trace (i.e. the chain closes on itself) → **hard** (`field_deadlock`).
3. **Custom Strategy override on the source field** → **hard** (conservative; custom resolvers can read arbitrary projections).

Self-refs (`<sourceKey> === <targetKey>`) are not special-cased; they go through the same rules. `phone.parent_id = $ref:phone.id` is soft (id is primitive). `phone.x = $ref:phone` is hard (embedding). A self-loop field-deadlock is hard.

## Cycle detection

A cycle is **rejected** iff it contains at least one **hard** edge. Equivalently: build the hard-edge subgraph and run cycle detection there.

Detected cycles are reported with:

```ts
{
  code: 'cycle_detected',
  detail: {
    kind: 'embedding' | 'field_deadlock',
    cycle: string[],   // schemaKey path, closing
    via?: string[],    // for field_deadlock: fromField path at each hop
  },
}
```

## Save-time enforcement

Touch points in [apps/workspace-svc/src/routes/schemas.ts](../../../apps/workspace-svc/src/routes/schemas.ts):

1. Extend `collectRefs` to return `{ targetKey, targetField, fromPath, fromFaker }`. (No semantic change; just keeps the raw `faker` value for downstream classification.)
2. Add `classifyEdges(allSchemasInWs)` that:
   - Builds a `(schemaKey, fieldPath) → ParsedProp` index.
   - For each `$ref:` it emits, walks the projection chain to decide hard/soft.
   - Detects field-level self-closure on the active trace.
3. Replace the existing `findCycle` / `detectCycleInGraph` callers to use only **hard** edges.
4. Update CREATE and UPDATE handlers and the post-key-rename cascade check.
5. Bubble the new `kind` into the existing `cycle_detected` error payload.

[apps/web/src/pages/dashboard/schemas/lib/mapServerError.ts](../../../apps/web/src/pages/dashboard/schemas/lib/mapServerError.ts) gains a message branch on `detail.kind` so the user sees a specific reason ("would embed entire row" vs. "field projections deadlock").

## Run-time enforcement

[packages/engine/src/extract-set-edges.ts](../../../packages/engine/src/extract-set-edges.ts) is extended:

```ts
export interface SetEdge {
  // …existing…
  hard: boolean;
}
```

Classification mirrors the save-side logic (same `(schemaKey, fieldPath)` index, same chain walk). Edges marked `hard: false` are excluded from cycle detection but **kept** for the resolver — soft edges still need to substitute values at row materialisation.

[packages/engine/src/topology.ts](../../../packages/engine/src/topology.ts):

- `detectCycles` filters out soft edges before running its colour DFS.
- `topoSort` partitions schemas into:
  - **Acyclic core** — ordered as today.
  - **Soft-cycle group(s)** — schemas reachable through soft-only strongly connected components. Within a group, order is insertion order (existing fallback), placed after every schema the group hard-depends on.

[packages/engine/src/plan-run-set.ts](../../../packages/engine/src/plan-run-set.ts):

- `cycle_in_set` now only fires on hard cycles.
- The returned `RunSetPlan` gains `softCycleSeedFields: ReadonlyArray<{ schemaKey: string; fieldPaths: string[] }>` — the anchor fields each soft-cycle schema must pre-materialise.

[packages/engine/src/run-set-stream.ts](../../../packages/engine/src/run-set-stream.ts) gains a **seed pass** before the main loop:

1. For each `softCycleSeedFields` entry, run a minimal generator that produces only those anchor fields for `count` rows of the schema, seeded by `(set.salt, schemaKey, rowIndex)`.
2. Push the produced anchor values into `projectedColumns[schemaKey][fieldPath]`.
3. Main pass proceeds as today; when generating a soft-cycle schema, resolvers reading peer anchor columns already have data.

Determinism is preserved because anchor field RNG depends only on `(salt, schemaKey, rowIndex, fieldPath)` — identical between the seed pass and the main pass.

### Why a seed pass and not full pre-materialisation

The existing `materialiseSchema` helper exists for custom-Strategy edges. We could use it here too, but it generates the entire row (every field) up-front, which double-runs faker for non-anchor fields. The seed pass keeps the cost proportional to "id-shaped columns × row count" and avoids changing how downstream resolvers are invoked.

## Determinism / RNG

`generateRows` already derives per-field RNG via `rng.ts` from `(salt, schemaKey, rowIndex, fieldPath)`. The seed pass uses the same derivation so anchor values match between passes. No new salt is introduced.

If at some point we wanted a "lite" generator that returned only specific fields, that helper would live next to `generateRows` and share the same RNG derivation. For this design we'll add it as `generateAnchorColumns({ schema, count, fieldPaths, salt, locale, … })`.

## Errors

| Code | Detail | When |
|---|---|---|
| `cycle_detected` | `kind: 'embedding'` | Cycle contains a `$ref:<other>` without `.field`. |
| `cycle_detected` | `kind: 'field_deadlock'` | Field-projection chain closes on itself. |
| `cycle_in_set` | `kind: 'embedding' \| 'field_deadlock'` | Same classes, fired by `planRunSet`. |

## Test plan

### Unit — engine

- `extract-set-edges.test.ts`: classifies each scenario (A, B, C-soft, C-hard, D) correctly.
- `topology.test.ts`:
  - A → no cycle, soft-cycle group identified.
  - B → hard cycle, kind `embedding`.
  - C with `$ref:phone.id` (primitive) → no cycle.
  - C with `$ref:phone` → hard, kind `embedding`.
  - D → hard, kind `field_deadlock`.
- `plan-run-set.test.ts`:
  - Plan succeeds for A; `softCycleSeedFields` lists `[{ phone: ['id'] }, { person: ['id'] }]`.
  - Plan fails for B and D with the right `kind`.

### Unit — workspace-svc

- Schemas route CREATE/UPDATE accepts A, rejects B/D, accepts self-ref to primitive, rejects self-ref without field.

### Integration

- e2e: create Phone and Person matching scenario A; create a Set including both with count 5 each; run the Set; assert each Phone row's `person_id` exists as some Person row's `id` and vice versa.

## Rollout

Single PR. No data migration needed: existing stored Schemas continue to parse the same way; only validators and cycle detectors change. Any previously-blocked save attempts will simply start succeeding.

## Open questions

- Should custom Strategy overrides on soft-cycle fields be allowed (downgraded to hard today)? Defer until someone asks.
- Should soft-cycle groups limit themselves to anchor fields that are guaranteed unique (e.g. `id`)? For 1:1 cross-pointing we need a stable mapping; current resolver uses index, which is fine. Revisit if non-id anchors are requested.
