# Streaming Engine Design

**Status:** Draft — 2026-05-20
**Owner:** —
**Companion plan:** `docs/superpowers/plans/2026-05-20-streaming-engine.md`

## Problem

`runSet` currently buffers **every row of every schema** in memory before
anything streams to S3 ([packages/engine/src/run-set.ts:49,61](../../packages/engine/src/run-set.ts#L49-L61),
[packages/engine/src/resolve-schema.ts:52,71](../../packages/engine/src/resolve-schema.ts#L52-L71)).
Two failure modes follow:

1. **Memory** — peak ≈ Σ(count × row-size). 10k UUIDs is fine; 1M rows of a
   wide schema OOMs the worker.
2. **Progress** — only one `run.progress` event per schema, emitted **after**
   the schema is fully generated ([processor.ts:84-100](../../apps/generation-worker/src/processor.ts#L84-L100)).
   For a one-schema Set the UI sits at `0 / 0 rows` for the entire run, then
   flips to 100% immediately before `run.completed`. Indistinguishable from a
   hang.

## Goals

- Generate and stream rows in **bounded batches**. Peak in-memory row count
  stays O(batchSize), not O(totalCount).
- Cross-schema references continue to work for every existing strategy
  (`1:1`, `evenSplit`, `random`, `custom`).
- `run.progress` events fire **during** generation, at a useful cadence
  (every N rows), so the UI bar moves in real time.
- No engine I/O. The engine remains pure; the worker still owns S3, Redis,
  and Mongo.
- Existing preview path (5–10 rows) keeps working with no behaviour change.
- Hard upper bound on `count` per schema, enforced at the BFF, to stop the
  silent OOM that motivated this redesign.

## Non-goals

- Sharding generation across multiple worker processes / threads.
- Parallel per-schema generation (topo order is still serial).
- Re-running failed runs (out of scope per existing spec).
- Replacing BullMQ, Redis pub/sub, or the NDJSON artifact format.

## Key observation: `__id` is index-derivable

`resolveSchema` mints `__id = ${salt}:${schema.key}:${i}`
([resolve-schema.ts:54](../../packages/engine/src/resolve-schema.ts#L54)). For
the default ref-projection (`toFieldPath === undefined`), `applyStrategy`
projects target `__id`s. Those `__id`s are pure functions of
`(salt, schemaKey, index)` — **no target row data is needed**. We only need
to know the target's `count`.

This means: for the common case (refs without `toFieldPath`), peak memory
across all schemas is O(batchSize) regardless of total row counts.

## Cross-schema state we actually need to keep

For each schema referenced by a downstream schema, the engine must retain
just enough state to answer the strategy resolver. Three cases:

| Edge shape | What target schema must export |
| --- | --- |
| `toFieldPath` undefined, any strategy except `custom` | nothing — `__id` is index-derivable |
| `toFieldPath` set, any strategy except `custom` | array of projected values for that field (length = target count) |
| `strategy.type === 'custom'` | every row of the source AND target schema, full payload |

In other words: as long as the user avoids `custom` strategies, peak memory
stays O(batchSize + Σ(projected-column sizes)). `custom` strategies retain
the current behaviour (full materialisation of the involved schemas).

## Architecture

### Engine produces an async stream

Replace the single `runSet(...) => Promise<RunSetResult>` API with:

```ts
export interface RunSetPlan {
  order: ReadonlyArray<string>;        // topo order of schemaKeys
  perSchema: ReadonlyArray<{ schemaKey: string; count: number }>;
  totalRows: number;
}

export interface RowBatch {
  schemaKey: string;
  rows: ReadonlyArray<ResolvedRow>;    // refs already substituted
  schemaProduced: number;              // running count within this schema
  schemaTotal: number;
  totalProduced: number;
  totalRows: number;
}

export interface RunSetStreamParams extends RunSetParams {
  batchSize?: number;                  // default 500
  signal?: AbortSignal;                // cooperative cancellation
}

export function planRunSet(params: Omit<RunSetParams, 'sandbox'>): RunSetPlan;
export async function* runSetStream(params: RunSetStreamParams): AsyncIterable<RowBatch>;
```

`planRunSet` is synchronous and pure — used by the processor up front to
populate `run.progress.total` and validate the Set (cycles, missing schemas)
before any rows are produced.

`runSetStream` walks `plan.order`, generating each schema in `batchSize`
batches:

1. Compute outgoing edges from this schema. For each edge, build a
   `StrategyResolver` that takes a source index → target value(s).
2. For each batch of `batchSize` rows:
   - Resolve every field via `resolveProp` (per-row deterministic from salt + index).
   - Substitute every ref placeholder by calling the resolver for that edge.
   - Yield the batch.
3. While generating, append projected-column data for any downstream edges
   that need it (`toFieldPath` set, or any custom strategy involving this
   schema as either side).

### Strategy resolver becomes per-index

`applyStrategy` is refactored from "operates on full arrays" to
"resolver factory that returns a per-source-index function". The four
existing strategies map cleanly:

- `1:1`: resolver(i) → target `__id` (or projected) for index `i`. Requires
  `source.count === target.count`.
- `evenSplit` (cardinality one): resolver(i) → target at `i % targetCount`.
- `evenSplit` (cardinality many): k = round(targetCount / sourceCount),
  resolver(i) → ids `[i*k, i*k+1, ...]` mod targetCount.
- `random` (cardinality one): seeded rng keyed by
  `(salt, fromSchemaKey, fromFieldPath, i)`, pick one index in `[0, targetCount)`.
- `random` (cardinality many, allowDuplicates): same, k picks.
- `random` (cardinality many, distinct): same, reservoir-style draw without
  replacement up to `min(k, targetCount)`.
- `custom`: **falls back** to the old buffered path. The user function
  expects full `sourceRows`/`targetRows`, so for any Set whose strategies
  include `custom`, the engine materialises the involved schemas in memory
  before yielding batches downstream. Documented as an explicit caveat;
  removing this is out of scope.

### Cancellation

`runSetStream` accepts an `AbortSignal`. The worker passes a signal sourced
from polling `cancelFlagKey(runId)`. The generator checks `signal.aborted`
at every batch boundary and throws `CancelledError` if so. (Same semantics
as today, just at finer granularity.)

### Processor changes

```text
plan = planRunSet({ set, schemas, customFunctions })
publish run.started
publish run.progress { produced: 0, total: plan.totalRows }      // NEW
writer = new RunArtifactWriter(...)
for await (batch of runSetStream({ ...params, signal })) {
  for (row of batch.rows) writer.writeRow({ __schemaKey: batch.schemaKey, ...row })
  publish run.progress { produced: batch.totalProduced, total: batch.totalRows }
}
writer.close()
publish run.completed
```

This naturally throttles progress events to one per `batchSize` rows
(default 500). With 10k rows that's 20 events — plenty for a smooth UI
without hammering Redis pub/sub.

### Hard cap on count

Add `MAX_ROWS_PER_SCHEMA = 1_000_000` enforced at the BFF when persisting a
Set (so it can never be enqueued at all), with a clear error. The engine
also throws if `count` exceeds the cap, as a belt-and-braces check.

This is independent of streaming — it's the floor that prevents anyone
from accidentally requesting 100M rows and DoS'ing the worker.

## Memory budget (post-change)

For a Set with N schemas and the **default ref shape** (no `toFieldPath`,
no `custom` strategies):

- Streaming buffer: O(batchSize × max-row-size). With batchSize=500 and
  a 5-field row, ≈ 500 × 200B ≈ 100 KB.
- Per-schema metadata (just `count`): O(N) integers.

For a Set with K schemas referenced via `toFieldPath`:

- Plus Σ (target-count × projected-field-size) for those K schemas.

For a Set with any `custom` strategy:

- Falls back to current behaviour for the schemas involved in those edges.
  Document this in the strategy editor UI so users see the memory
  implication of choosing `custom`.

## Migration

- `runSet` is removed from the public engine surface. Only `processor.ts`
  consumes it; the BFF uses `extractSetEdges` + `detectCycles` directly,
  which remain unchanged.
- Preview path uses the same `runSetStream` with `batchSize` ≥ the preview
  limit — same code, same semantics.

## Open questions

- Should we expose `batchSize` as a runtime env var on the worker? Probably
  yes (`GENERATION_BATCH_SIZE`, default 500) so it can be tuned without a
  redeploy.
- Where to enforce the per-schema cap — Set creation only, or also at run
  enqueue? Plan goes with Set creation; document this.

## Out of scope (follow-ups)

- Streaming custom strategies (would require redefining the custom function
  contract — they'd need an iterator-style API instead of `sourceRows: array`).
- Parallel per-schema generation.
- Resumable runs after worker crash.
