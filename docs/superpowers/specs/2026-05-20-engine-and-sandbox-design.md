# Generation Engine + Sandbox — Design

> Date: 2026-05-20
> Status: Approved (brainstorming complete, plan pending)
> Scope: Sub-project 3 of 4 in the "Sets end-to-end" initiative.

## Context

The engine and sandbox packages have shipped as skeletons since bootstrap. `resolveSchema` and `applyStrategy` throw `NotImplementedError`. `createSandboxPool` returns an object whose `invoke()` throws "not implemented yet". Custom Functions persist but cannot run.

The Sets CRUD slice (sub-project 1) and Custom Functions CRUD slice (sub-project 2) have shipped. The data the engine needs — Schemas with property trees, Sets with strategy overrides, Custom Functions with source — is all there in Mongo, with stable OpenAPI types.

This sub-project ships the missing core. After it lands, given a `Set` + the workspace's Schemas + Custom Functions + a sandbox pool, `runSet(...)` produces deterministic rows with references fully resolved. Sub-project 4 hooks this to BullMQ + S3 streaming + UI.

## Sub-project plan (context for this spec)

1. ✅ Sets CRUD.
2. ✅ Custom Functions CRUD.
3. **Generation engine + sandbox** ← this spec.
4. Run pipeline + UI (BullMQ, NDJSON artifacts, WebSocket progress, Run button activation, Preview tab).

## Goals

- `resolveSchema` walks the OpenAPI `SchemaProp[]` tree and produces deterministic rows. Faker methods, `$ref:` placeholders, and `$fn:<id>` Custom Function calls all resolve to real values.
- `applyStrategy` implements all four Strategy variants (`1:1`, `random`, `evenSplit`, `custom`) against the persisted OpenAPI Strategy union.
- `runSet` orchestrates resolve → strategy → reference substitution in a single async call.
- `createSandboxPool` returns a real worker-thread pool that compiles JavaScript inside a `node:vm` context with no Node globals, enforces per-call timeouts and per-worker memory caps, and caches compiled functions per source-hash.
- Determinism: identical `Set + Schemas + Custom Functions + salt` always produces identical rows.

## Non-goals

- BullMQ job processing (sub-project 4).
- NDJSON streaming to S3 (sub-project 4).
- WebSocket progress events (sub-project 4).
- Run button activation + Preview tab (sub-project 4).
- Run cancellation, retries, history (sub-project 4).
- A TypeScript-aware sandbox. Saved sources are JavaScript; the sandbox parses + executes JS.
- Engine-level data validation against `format`. Faker generates the right shape for the chosen method; we don't post-check it.
- Engine concurrency / row-level parallelism. v1 is single-threaded per Schema; the sandbox pool gives custom-function-level parallelism only.

## Vocabulary

Names follow [docs/CONTEXT.md](../../CONTEXT.md): **Schema**, **Set**, **Reference**, **Strategy**, **Value Generator**, **Custom Function**, **Run**.

One TypeScript-only rename remains: the OpenAPI `Set` type appears as `MirageSet` in SPA code to avoid colliding with `Set<T>`. The engine code can name it `MirageSet` too.

## Architectural decisions (locked in during brainstorming)

| Decision | Choice | Why |
|---|---|---|
| Engine type shape | OpenAPI `SchemaProp[]` and OpenAPI `Strategy` union | Single source of truth; matches persistence and the helpers added in sub-projects 1 and 2 |
| Sandbox caching | Compiled-function cache keyed by source-hash, inside each worker | Amortises the compile cost over the many calls a Value Generator does per Set |
| Sandbox isolation | `worker_threads` + `vm.createContext({})` | Architecture-mandated; no Node globals leak into user code |
| Custom-function execution | Single sandbox pool reused across all calls in a `runSet` invocation | Avoids per-Schema pool churn |
| Determinism | Per-Set salt feeds every random choice via mulberry32 + faker.seed | Same Set + salt ⇒ same rows on every run |
| Abstract types in packages/types/src/{schema,set}.ts | Left in place as documentation; not imported by the engine going forward | Removing them creates churn that doesn't serve this slice |

## Package layout

```
packages/engine/src/
  index.ts                       re-exports
  errors.ts                      kept
  cycle.ts                       unchanged (abstract-types path; dead but harmless)
  extract-set-edges.ts           unchanged
  extract-fn-refs.ts             unchanged
  custom-function-registry.ts    RESHAPED — entry now carries usage
  rng.ts                         NEW — mulberry32 + hashSeed
  faker-engine.ts                NEW — locale resolution, per-Schema seeding
  resolve-schema.ts              REWRITTEN — OpenAPI walk + faker + $fn invocation
  apply-strategy.ts              REWRITTEN — OpenAPI Strategy union
  run-set.ts                     NEW — orchestrator

packages/sandbox/src/
  index.ts                       re-exports
  types.ts                       unchanged
  protocol.ts                    MODIFIED — add sourceHash + nullable source
  pool.ts                        REWRITTEN — real worker pool
  worker.ts                      REWRITTEN — message loop + vm + cache
```

## Engine

### Custom Function Registry (reshaped)

```ts
// custom-function-registry.ts
export interface CustomFunctionEntry {
  source: string;
  usage: 'valueGenerator' | 'strategy' | 'both';
}

export interface CustomFunctionRegistry {
  get(id: string): CustomFunctionEntry | undefined;
}

export function customFunctionRegistryFromMap(
  map: ReadonlyMap<string, CustomFunctionEntry>,
): CustomFunctionRegistry;
```

The registry is a plain interface — generation-worker (sub-project 4) builds one from a Mongo query.

### Deterministic RNG (`rng.ts`)

```ts
/** mulberry32 — small fast 32-bit PRNG, returns [0, 1). */
export function mulberry32(seed: number): () => number;

/** Hash an arbitrary list of strings into a 32-bit unsigned int. */
export function hashSeed(...parts: string[]): number;
```

`hashSeed` is FNV-1a over the concatenation `parts.join(0x1F)` — collision-resistant enough for seeding.

### Faker engine (`faker-engine.ts`)

```ts
import type { Faker } from '@faker-js/faker';

export interface FakerEngine {
  /** Reseed before resolving rows for a Schema. */
  seed(n: number): void;
  /** Invoke `faker.<ns>.<method>()`. Throws if the path is unknown. */
  call(method: string): unknown;
  /** The underlying instance — exposed for Custom Functions' `ctx.faker`. */
  faker: Faker;
  /** Whether `locale` was honored. False if it fell back to `en`. */
  localeHonored: boolean;
}

export function createFakerEngine(locale: string): FakerEngine;
```

Implementation uses `@faker-js/faker`'s `allLocales` registry: if `allLocales[locale]` exists we instantiate `new Faker({ locale: [allLocales[locale], allLocales.en] })`. Otherwise fall back to `new Faker({ locale: [allLocales.en] })` and set `localeHonored = false`.

`call()` walks `faker[ns][method]` and invokes it with no args. Unknown paths throw `EngineError('unknown_faker_method', method)`.

### `resolveSchema`

```ts
// resolve-schema.ts
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';

export interface ResolvedRow {
  readonly __schemaKey: string;
  readonly __id: string;
  readonly [field: string]: unknown;
}

export interface ResolveSchemaParams {
  schema: Api.components['schemas']['Schema'];
  count: number;
  salt: string;
  locale: string;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

/** Reference placeholder embedded into a row during resolveSchema; runSet replaces it. */
export interface RefPlaceholder {
  readonly __ref: true;
  readonly toSchemaKey: string;
  readonly fromFieldPath: string;
}

export function resolveSchema(p: ResolveSchemaParams): Promise<ResolvedRow[]>;
```

#### Walk semantics

For each row index `i`:

1. Compute `rowId = `${salt}:${schema.key}:${i}``.
2. Walk `schema.properties` top-down. For each `SchemaProp`:
   - **`type` is `string`/`number`/`integer`/`boolean`**:
     - `faker` field is `undefined` or `''` → assign `null`.
     - `faker === '$ref:<key>(.field)?'` → assign `{ __ref: true, toSchemaKey, fromFieldPath }`.
     - `faker === '$fn:<id>'` → look up the function. Require `entry.usage ∈ {valueGenerator, both}` else throw `EngineError('fn_usage_mismatch', { id, usage })`. Call `sandbox.invoke(entry.source, ctx)` where `ctx = { faker: fakerEngine.faker, rng: rowRng, salt }`. Assign the awaited result.
     - Otherwise it's a faker method path. Call `fakerEngine.call(faker)` and assign the result.
   - **`type === 'object'`**: recursively resolve `fields[]` into an object literal.
   - **`type === 'array'`**: emit a length-3 array (fixed for v1 — OpenAPI SchemaProp has no count knob). Resolve `items` against each index.
3. Compose the row with `__schemaKey`, `__id`, plus property values.

Per row: a fresh `rowRng = mulberry32(hashSeed(salt, schema.key, String(i)))`. `fakerEngine.seed(hashSeed(salt, schema.key))` runs **once** before the row loop — faker walks deterministically through its internal state as rows are generated.

Returned rows still contain `RefPlaceholder` markers. `runSet` substitutes them after `applyStrategy` produces the id mapping.

### `applyStrategy`

```ts
// apply-strategy.ts
export interface ApplyStrategyParams {
  strategy: Api.components['schemas']['Strategy'];
  sourceRows: ReadonlyArray<ResolvedRow>;
  targetRows: ReadonlyArray<ResolvedRow>;
  cardinality: 'one' | 'many';
  many?: { min: number; max: number };
  salt: string;
  fromSchemaKey: string;          // for stable per-edge RNG seeding
  fromFieldPath: string;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

export function applyStrategy(p: ApplyStrategyParams): Promise<string[] | string[][]>;
```

Per-edge RNG: `edgeRng = mulberry32(hashSeed(salt, fromSchemaKey, fromFieldPath))`.

| Strategy type | Cardinality `one` | Cardinality `many` |
|---|---|---|
| `1:1` | Requires `sourceRows.length === targetRows.length`; result `[i] = targetRows[i].__id`. Errors `strategy_11_count_mismatch` otherwise. | Errors `strategy_11_cardinality` — 1:1 with many is undefined |
| `random` | For each source row, pick one target id via `targetRows[Math.floor(edgeRng() * n)]`. | Per source row, draw `k = many.min + Math.floor(edgeRng() * (many.max - many.min + 1))` ids. If `strategy.allowDuplicates` is `false`, sample without replacement (Fisher–Yates over a fresh copy of the target index array each row); otherwise pick with replacement |
| `evenSplit` | `result[i] = targetRows[i % targetRows.length].__id` | Per source row, take the round-robin slice of length `k` clamped to `[many.min, many.max]` |
| `custom` | Look up function; require `usage ∈ {strategy, both}`. Single `sandbox.invoke(entry.source, ctx)` with `ctx = { sourceRows, targetRows, cardinality, rng: edgeRng, salt }`. Validate shape (`string[]` for `one`, `string[][]` for `many`); error `strategy_custom_bad_shape` on mismatch. | Same |

Note: cardinality on the OpenAPI shape is implicit — derived from whether the property sits inside any `type: 'array'` ancestor (already done by `extractSetEdges`). The Strategy variant itself is untyped on cardinality; `runSet` passes the derived value plus a `many: { min, max }` block when applicable. For v1, `many.min = 1` and `many.max = 3` if no explicit range exists.

### `runSet` orchestrator

```ts
// run-set.ts
export interface RunSetParams {
  set: Api.components['schemas']['Set'];
  schemas: ReadonlyArray<Api.components['schemas']['Schema']>;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

export interface RunSetResult {
  rowsByKey: Map<string, ResolvedRow[]>;
  edges: ReadonlyArray<SetEdge>;
}

export function runSet(p: RunSetParams): Promise<RunSetResult>;
```

Algorithm:

1. **Validate cycles.** Build the `includedKeys = new Set(set.schemas.map(s => s.schemaKey))`. Call `extractSetEdges(schemas, includedKeys)`. If `detectReferenceCycles` (adapted to work on the OpenAPI shape — see below) reports cycles, throw `EngineError('cycle_in_set', { cycles })`.
2. **Topological order.** Compute a topo order over the included schemas using the edge list — schemas with no incoming edges first. (Acyclic by step 1.) Schemas not in any edge come first in arbitrary order.
3. **Generate rows per Schema.** For each `schemaKey` in topo order:
   - Find `schemas.find(s => s.key === schemaKey)`. Pull `count` from `set.schemas[].count`.
   - Call `resolveSchema({ schema, count, salt: set.salt, locale: set.output.locale, customFunctions, sandbox })`.
   - Store in `rowsByKey`.
4. **Apply strategies and substitute.** For each `edge` in `extractSetEdges`:
   - Look up the user's override in `set.strategies` (by `schemaKey + fieldPath`). Default to `{ type: '1:1' }` if none.
   - Build `many: { min: 1, max: 3 }` for edges with cardinality `many` (constant for v1 — Schema's array nodes don't expose min/max yet).
   - Call `applyStrategy` with sourceRows = `rowsByKey.get(edge.fromSchemaKey)`, targetRows = `rowsByKey.get(edge.toSchemaKey)`.
   - Walk `rowsByKey.get(edge.fromSchemaKey)`; for each source row, find the `RefPlaceholder` at `edge.fromFieldPath` and replace it with the strategy's output for that row index. Path walk re-uses the dotted/`[]` convention already used by `extractSetEdges`.
5. Return `{ rowsByKey, edges }`.

#### Cycle detection adapter

The existing `detectReferenceCycles` in `cycle.ts` walks the abstract `Property` tree. Rather than retrofit it, `run-set.ts` performs cycle detection directly over `extractSetEdges` output (3-colour DFS on the schemaKey graph). This keeps the abstract types fully isolated as dead code, and gives us a cycle detector that operates on the same shape as everything else.

Result type:

```ts
interface CycleDetectionResult {
  cycles: Array<{ schemaKeys: string[]; fieldPaths: string[] }>;
}
```

## Sandbox

### Protocol changes ([protocol.ts](../../../packages/sandbox/src/protocol.ts))

```ts
export interface SandboxInvokeMessage {
  type: 'invoke';
  callId: string;
  sourceHash: string;             // sha1(source).slice(0, 12)
  source: string | null;          // null when caller knows the worker has it cached
  args: unknown;
  timeoutMs: number;
}
```

Add a sentinel error name `'CacheMiss'` returned by the worker when `sourceHash` is unknown and `source` is `null`. The pool retries the call with `source` populated.

### Pool ([pool.ts](../../../packages/sandbox/src/pool.ts))

Maintains:

- `workers: Worker[]` of length `options.size` (must be ≥1; 0 is rejected at creation).
- `freeList: Worker[]` — workers ready to accept the next call.
- `queue: Array<QueuedCall>` — FIFO of `{ source, args, opts, resolve, reject }` that ran out of free workers.
- `pending: Map<callId, { worker, resolve, reject, timer }>` — in-flight calls.
- `cached: Map<workerIndex, Set<sourceHash>>` — the pool's mirror of each worker's compiled-function cache, so it knows when `source` can be sent as `null`.

`invoke(source, args, opts?)`:

1. Compute `sourceHash`. Mint a `callId`.
2. Take a worker from `freeList`. If none, enqueue and return the pending promise.
3. Decide `sendSource = !cached.get(worker.index).has(sourceHash)`.
4. Post `{ type: 'invoke', callId, sourceHash, source: sendSource ? source : null, args, timeoutMs }`.
5. Start a wall-clock `setTimeout` for `timeoutMs + 500` (cushion for IPC). On fire: reject with `SandboxTimeoutError`, terminate the worker, spin a replacement (drops its cache).
6. On `result` from worker:
   - `errorName === 'CacheMiss'` → resend with `source` populated.
   - `ok === true` → clear timer, push worker back to free-list, drain queue, resolve.
   - `ok === false` and `errorName === 'TimeoutError'` → reject `SandboxTimeoutError`.
   - `ok === false` and `errorName === 'SyntaxError'` → reject `SandboxCompileError`.
   - otherwise reject `SandboxRuntimeError` with the worker's stack.
7. On worker `exit` event with non-zero code (OOM): reject any pending call on that worker with `SandboxRuntimeError('worker exited')`, spawn a replacement, drain queue.

`shutdown()`:

- Mark shutting down.
- Wait for in-flight calls to settle (with a 5s grace; after that, force-terminate).
- `worker.terminate()` all workers.

### Worker ([worker.ts](../../../packages/sandbox/src/worker.ts))

```ts
import { parentPort } from 'node:worker_threads';
import vm from 'node:vm';

const ctx = vm.createContext({});                       // no Node globals
const cache = new Map<string, vm.CompiledFunction>();  // sourceHash → compiled

parentPort!.on('message', (msg: SandboxMessageToWorker) => {
  if (msg.type !== 'invoke') return;
  const { callId, sourceHash, source, args, timeoutMs } = msg;
  try {
    let fn = cache.get(sourceHash);
    if (!fn) {
      if (source === null) {
        parentPort!.postMessage({
          type: 'result', callId, ok: false,
          errorName: 'CacheMiss', errorMessage: 'sourceHash not cached',
        });
        return;
      }
      fn = vm.compileFunction(source, ['ctx'], { parsingContext: ctx, timeout: timeoutMs });
      cache.set(sourceHash, fn);
    }
    const value = fn(args);
    parentPort!.postMessage({ type: 'result', callId, ok: true, value });
  } catch (e) {
    parentPort!.postMessage({
      type: 'result', callId, ok: false,
      errorName: e instanceof Error ? e.name : 'Error',
      errorMessage: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.split('\n').slice(0, 6).join('\n') : undefined,
    });
  }
});
```

Key properties:
- One `vm.Context` per worker, reused — context creation is expensive.
- `vm.compileFunction` parses + binds in one shot. Its `timeout` option applies to the synchronous invocation too — exceeding it throws inside the worker as a `TimeoutError`.
- No Node globals: `process`, `require`, `Buffer`, `fs`, `module`, `__dirname` are all absent from `ctx`. A user function calling `process` throws `ReferenceError`.
- The cache lives in worker memory. When the worker is replaced (timeout / OOM / exit), the cache evaporates and the pool's mirror is reset.

### Wiring

- `pool.ts` imports `worker.ts` via `new Worker(new URL('./worker.js', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: options.memoryCapMb } })`. The package's `package.json` exports `./worker` so the file resolves at runtime; tsx in dev / Node's native ESM in prod both handle it.

## Determinism contract

Given the same `Set` (id, salt, schemas[], strategies[], output.locale), the same Schemas (key + properties[]), and the same Custom Functions (source + usage), `runSet` returns rows that are bit-for-bit identical across calls.

What this means:
- Faker is reseeded *before* each Schema with `hashSeed(salt, schemaKey)`.
- Each row gets a fresh `rowRng` for any Custom Function it calls.
- Each Strategy edge gets a fresh `edgeRng`.
- Reference substitution is deterministic because the strategy output is deterministic.

What this doesn't cover:
- Custom Functions that use `Math.random()` — they break determinism. The docs in the Functions editor steer users toward `ctx.rng()` for this reason.
- Date.now() / new Date() — non-deterministic. Same caveat.

These are listed in the "Known caveats" section of the Functions empty state in v2; for v1 we accept the foot-gun.

## Faker.js dependency

`@faker-js/faker` is added as a direct dep on `@mirage/engine`. The SPA already lists Monaco type hints for `ctx.faker.*` — those hints now match a real runtime. Engine bundle stays server-side per the module boundary rules in [eslint.config.mjs](../../../eslint.config.mjs); the SPA does not import the engine's faker. (The SPA's existing `@mirage/engine` dep is used only for the pure helpers `extractSetEdges` and `extractFnRefs`, which don't pull faker into the bundle thanks to Vite's tree-shaking.)

## Testing approach

Per [TECH_ARCHITECHRE.md §5](../../TECH_ARCHITECHRE.md), no automated tests in this phase. Verification is `nx run-many -t typecheck,lint` across the touched projects plus targeted smoke scripts run via `tsx`:

- `engine`: a `tsx` script that builds a registry with one VG function + one strategy function, constructs a fake `SandboxPool` (with an in-process trivial implementation), and calls `runSet` on a 2-schema set with one cross-ref. Asserts row counts, ref shapes, and determinism (run twice, deep-equal results).
- `sandbox`: a `tsx` script that spins up a real pool size 1 and exercises the four smoke cases listed in §3 of the brainstorm (trivial call, cache hit, timeout, `process` reference).

Both scripts live in `packages/engine/scripts/` and `packages/sandbox/scripts/` and are runnable via `pnpm --filter @mirage/engine exec tsx scripts/run-set-smoke.mts` and the equivalent for sandbox. The Implementation Plan calls them out as required verification steps.

## Out of scope (revisited)

- The Run pipeline (BullMQ, NDJSON, S3, WS progress, Preview rendering, Run UI activation) — sub-project 4.
- Streaming generation (rows are buffered in memory; sub-project 4 wraps the buffer in an NDJSON stream).
- Per-schema row-level parallelism.
- Per-org sandbox isolation; the pool is global per worker process.
- Custom Function execution observability beyond timing (no profiling hooks, no per-call logging).
- TypeScript source in Custom Functions.
- Schema `format` post-validation.

## Open follow-ups (post-sub-project 4)

- Make array node count configurable on `SchemaProp` (min/max). Today the engine emits length-3 arrays; the editor offers no knob.
- Make `many: { min, max }` Strategy-configurable rather than constant-3.
- Cancellation cooperative-checkpoint inside `runSet` (today, a long `runSet` is uninterruptible — sub-project 4 wraps it in a BullMQ job that's outside the engine).
- Faker locale-specific subsets (currently we fall back to `en` for unknown locales; a curated locale list with explicit overrides comes later).
