# Streaming Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **User preferences (this repo):** Do NOT create a git worktree. Do NOT make git commits. "Checkpoint" steps replace commit steps — just verify cleanliness, do not run `git commit`.

**Goal:** Replace the engine's buffered `runSet` with a streaming pipeline that yields rows in bounded batches so peak memory is O(batchSize), and emit `run.progress` per batch so the UI bar moves in real time.

**Architecture:** Split the existing `runSet` into two APIs: a synchronous `planRunSet` (validation + topo + totals) and an `async function*` `runSetStream` (yields `RowBatch`). Refactor `applyStrategy` from "operates on full arrays" to a "resolver factory" producing a per-source-index function so refs can be substituted row-by-row. `custom` strategies fall back to buffered materialisation of the schemas they touch. The worker consumes the stream — one `writeRow` and one `run.progress` per batch. The BFF gets a 1 M cap on `count` per schema as a belt against silent OOM.

**Tech Stack:** TypeScript (Node 24), `@mirage/engine` (pure, no I/O), `@mirage/sandbox` (vm2-equivalent), BullMQ + Redis (worker side), Vitest (new test infra for the engine).

---

## File Structure

**New files in `packages/engine/src/`:**
- `topology.ts` — `detectCycles` + `topoSort` extracted from `run-set.ts` so `planRunSet` can use them without duplication.
- `plan-run-set.ts` — `planRunSet(params)` synchronous, returns `{ order, perSchema, totalRows }`. Enforces per-schema cap.
- `strategy-resolver.ts` — `createStrategyResolver(...)` factory returning `(sourceIndex) => unknown | unknown[]` per edge.
- `generate-rows.ts` — `generateRows(params)` async generator yielding one `ResolvedRow` at a time for a single schema. Deterministic, replaces the array-returning `resolveSchema`.
- `run-set-stream.ts` — `runSetStream(params)` async generator. Walks topo order, batches per schema, applies resolvers, yields `RowBatch`. Supports `AbortSignal`.
- `vitest.config.ts` — engine test runner config.
- `src/__tests__/*.test.ts` — co-located tests per module.

**Modified files:**
- `packages/engine/package.json` — add `vitest`, `@types/node` already present; add `test` + `test:watch` scripts; nx `test` target.
- `packages/engine/src/index.ts` — export new APIs, remove `runSet` re-export.
- `packages/engine/src/run-set.ts` — **delete** (the only external caller is `processor.ts`, migrated in Task 11). Keep its util `substituteRef` by moving it into `run-set-stream.ts`.
- `packages/engine/src/apply-strategy.ts` — keep file but it becomes the *custom*-only buffered path (`applyCustomStrategy`). Non-custom strategies move to `strategy-resolver.ts`.
- `packages/engine/src/resolve-schema.ts` — convert `resolveSchema` body to delegate to `generateRows` for backwards compatibility (or delete if no other caller — verified during Task 6).
- `apps/generation-worker/src/processor.ts` — consume `runSetStream`, emit progress per batch, plumb `AbortSignal` from cancel poller.
- `apps/generation-worker/src/env.ts` — add `GENERATION_BATCH_SIZE` (default 500).
- `apps/workspace-svc/src/routes/_setHelpers.ts` — lower count cap from 10 000 000 to 1 000 000 (`MAX_ROWS_PER_SCHEMA`); rephrase error message.

**Out of scope (per spec):** parallel per-schema generation; resumable runs; replacing `custom` strategy contract; multi-process sharding.

---

## Conventions used in this plan

- All paths are repo-relative to `/Users/pathik/Desktop/Github/mirage`.
- `pnpm -F @mirage/engine test -- <file>` runs a single vitest file in the engine workspace.
- Each task ends with a **Checkpoint** step (no `git commit`). The checkpoint is: `pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine lint && pnpm -F @mirage/engine test` (scoped to whichever package the task touched).
- Tests live under `packages/engine/src/__tests__/`, matching the source file name. Vitest discovers `**/*.test.ts`.

---

## Task 1: Set up Vitest in @mirage/engine

The engine has zero tests today and no test runner. Set up Vitest first; all later tasks depend on it.

**Files:**
- Modify: `packages/engine/package.json`
- Create: `packages/engine/vitest.config.ts`
- Create: `packages/engine/src/__tests__/smoke.test.ts`

- [ ] **Step 1.1: Add vitest devDependency**

Edit `packages/engine/package.json` — add `devDependencies` block and bump the nx targets:

```json
{
  "name": "@mirage/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@faker-js/faker": "^9.3.0",
    "@mirage/sandbox": "workspace:*",
    "@mirage/types": "workspace:*"
  },
  "devDependencies": {
    "vitest": "^2.1.8"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "nx": {
    "name": "@mirage/engine",
    "targets": {
      "typecheck": {
        "executor": "nx:run-commands",
        "options": {
          "command": "tsc -p tsconfig.json --noEmit",
          "cwd": "packages/engine"
        }
      },
      "lint": {
        "executor": "nx:run-commands",
        "options": {
          "command": "eslint src",
          "cwd": "packages/engine"
        }
      },
      "test": {
        "executor": "nx:run-commands",
        "options": {
          "command": "vitest run",
          "cwd": "packages/engine"
        }
      }
    }
  }
}
```

- [ ] **Step 1.2: Create the vitest config**

Create `packages/engine/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 5_000,
    pool: 'threads',
  },
});
```

- [ ] **Step 1.3: Install dependencies**

Run from repo root:

```bash
pnpm install
```

Expected: `vitest` and its peers added under `packages/engine/node_modules`. No errors.

- [ ] **Step 1.4: Write a smoke test (red)**

Create `packages/engine/src/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashSeed } from '../rng.js';

describe('engine smoke', () => {
  it('hashSeed is deterministic', () => {
    expect(hashSeed('a', 'b')).toBe(hashSeed('a', 'b'));
    expect(hashSeed('a', 'b')).not.toBe(hashSeed('a', 'c'));
  });
});
```

- [ ] **Step 1.5: Run the smoke test (green)**

Run:

```bash
pnpm -F @mirage/engine test
```

Expected: 1 test passes. If vitest reports a missing ESM extension, check that imports use `.js` suffix (matches the rest of the codebase).

- [ ] **Step 1.6: Checkpoint**

```bash
pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine lint && pnpm -F @mirage/engine test
```

Expected: all three pass. **Do not commit.**

---

## Task 2: Extract topology helpers (`detectCycles`, `topoSort`) to a public module

`planRunSet` needs cycle detection and topo sort over the OpenAPI Schema / SetEdge shape. These currently live as private helpers in `run-set.ts`. Move them to `topology.ts` so `planRunSet` and any future caller (BFF) can use them without duplication.

**Files:**
- Create: `packages/engine/src/topology.ts`
- Create: `packages/engine/src/__tests__/topology.test.ts`
- Modify: `packages/engine/src/run-set.ts` (remove the local copies, import from `topology.ts`)
- Modify: `packages/engine/src/index.ts` (export the new module)

- [ ] **Step 2.1: Write failing topology tests**

Create `packages/engine/src/__tests__/topology.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SetEdge } from '../extract-set-edges.js';
import { detectCycles, topoSort } from '../topology.js';

const edge = (
  fromSchemaKey: string,
  toSchemaKey: string,
  fromFieldPath = `${toSchemaKey}_ref`,
): SetEdge => ({
  fromSchemaKey,
  toSchemaKey,
  fromFieldPath,
  cardinality: 'one',
});

describe('detectCycles', () => {
  it('returns [] for an acyclic DAG', () => {
    const keys = new Set(['a', 'b', 'c']);
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(detectCycles(keys, edges)).toEqual([]);
  });

  it('finds a 2-node cycle', () => {
    const keys = new Set(['a', 'b']);
    const edges = [edge('a', 'b'), edge('b', 'a')];
    const cycles = detectCycles(keys, edges);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.schemaKeys).toEqual(['a', 'b', 'a']);
  });

  it('finds a self-loop', () => {
    const keys = new Set(['a']);
    const edges = [edge('a', 'a')];
    const cycles = detectCycles(keys, edges);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.schemaKeys).toEqual(['a', 'a']);
  });
});

describe('topoSort', () => {
  it('returns a valid order for a DAG', () => {
    const keys = new Set(['a', 'b', 'c']);
    // a → b means "a references b" → resolve b before a.
    const edges = [edge('a', 'b'), edge('b', 'c')];
    const order = topoSort(keys, edges);
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
  });

  it('falls back to insertion order when cycles exist', () => {
    const keys = new Set(['a', 'b']);
    const edges = [edge('a', 'b'), edge('b', 'a')];
    const order = topoSort(keys, edges);
    expect(new Set(order)).toEqual(new Set(['a', 'b']));
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run:

```bash
pnpm -F @mirage/engine test -- topology
```

Expected: FAIL — `Cannot find module '../topology.js'`.

- [ ] **Step 2.3: Create `topology.ts`**

Create `packages/engine/src/topology.ts` — copy the implementations from `run-set.ts` lines 99–172 verbatim, only swapping `private` semantics for named exports:

```ts
import type { SetEdge } from './extract-set-edges.js';

export interface CyclePath {
  schemaKeys: string[];
  fieldPaths: string[];
}

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function detectCycles(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): CyclePath[] {
  const adj = new Map<string, Array<{ to: string; fieldPath: string }>>();
  for (const k of schemaKeys) adj.set(k, []);
  for (const e of edges) {
    adj.get(e.fromSchemaKey)?.push({ to: e.toSchemaKey, fieldPath: e.fromFieldPath });
  }

  const colour = new Map<string, number>();
  for (const k of schemaKeys) colour.set(k, WHITE);

  const cycles: CyclePath[] = [];
  const stack: Array<{ key: string; incomingField: string }> = [];

  const visit = (key: string, incomingField: string): void => {
    colour.set(key, GRAY);
    stack.push({ key, incomingField });
    for (const e of adj.get(key) ?? []) {
      const c = colour.get(e.to);
      if (c === undefined) continue;
      if (c === GRAY) {
        const startIdx = stack.findIndex((f) => f.key === e.to);
        if (startIdx === -1) continue;
        const cyclePath = stack.slice(startIdx);
        cycles.push({
          schemaKeys: [...cyclePath.map((f) => f.key), e.to],
          fieldPaths: [...cyclePath.slice(1).map((f) => f.incomingField), e.fieldPath],
        });
      } else if (c === WHITE) {
        visit(e.to, e.fieldPath);
      }
    }
    stack.pop();
    colour.set(key, BLACK);
  };

  for (const k of schemaKeys) {
    if (colour.get(k) === WHITE) visit(k, '');
  }
  return cycles;
}

/**
 * Edge from A → B means A references B. Resolve B before A.
 * Returns insertion order if a cycle prevents a valid topological sort.
 */
export function topoSort(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): string[] {
  const inDeg = new Map<string, number>();
  for (const k of schemaKeys) inDeg.set(k, 0);
  const reverseAdj = new Map<string, string[]>();
  for (const k of schemaKeys) reverseAdj.set(k, []);
  for (const e of edges) {
    inDeg.set(e.fromSchemaKey, (inDeg.get(e.fromSchemaKey) ?? 0) + 1);
    reverseAdj.get(e.toSchemaKey)?.push(e.fromSchemaKey);
  }
  const queue: string[] = [];
  for (const [k, d] of inDeg) if (d === 0) queue.push(k);
  const out: string[] = [];
  while (queue.length > 0) {
    const k = queue.shift()!;
    out.push(k);
    for (const next of reverseAdj.get(k) ?? []) {
      const d = (inDeg.get(next) ?? 0) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (out.length !== schemaKeys.size) {
    return [...schemaKeys];
  }
  return out;
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run:

```bash
pnpm -F @mirage/engine test -- topology
```

Expected: PASS — 5 tests.

- [ ] **Step 2.5: Delete the duplicate copies in `run-set.ts`**

Edit `packages/engine/src/run-set.ts` — replace the local `detectCycles` (lines 99–144) and `topoSort` (146–172) with an import at the top:

Replace the existing imports block (lines 1–12) and the helper functions with:

```ts
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { applyStrategy } from './apply-strategy.js';
import { extractSetEdges, type SetEdge } from './extract-set-edges.js';
import { EngineError } from './errors.js';
import { detectCycles, topoSort } from './topology.js';
import {
  isRefPlaceholder,
  resolveSchema,
  type RefPlaceholder,
  type ResolvedRow,
} from './resolve-schema.js';
```

Then delete the bodies of `detectCycles` (current lines 99–144) and `topoSort` (current lines 146–172). Keep `substituteRef`, `parsePath`, `walkAndReplace` — they're still used.

- [ ] **Step 2.6: Verify nothing broke**

Run:

```bash
pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine test
```

Expected: PASS — typecheck clean, all tests pass.

- [ ] **Step 2.7: Export from index**

Edit `packages/engine/src/index.ts` — add the topology export. Final state:

```ts
/**
 * `@mirage/engine` — pure generation core.
 *
 * No I/O. Same inputs always produce the same outputs (modulo the supplied
 * salt). Consumed by the generation worker, the BFF (for cycle validation),
 * and the SPA (for live relationship-graph highlighting).
 */

export * from './errors.js';
export * from './cycle.js';
export * from './custom-function-registry.js';
export * from './resolve-schema.js';
export * from './apply-strategy.js';
export * from './extract-set-edges.js';
export * from './extract-fn-refs.js';
export * from './rng.js';
export * from './faker-engine.js';
export * from './topology.js';
export * from './run-set.js';
```

- [ ] **Step 2.8: Checkpoint**

```bash
pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine lint && pnpm -F @mirage/engine test
```

Expected: all pass.

---

## Task 3: Add `planRunSet`

A pure synchronous validator that the worker calls before streaming. Validates inclusions, missing schemas, count cap, cycles; returns the topo order and totals so the worker can publish `run.progress { produced: 0, total }` immediately.

**Files:**
- Create: `packages/engine/src/plan-run-set.ts`
- Create: `packages/engine/src/__tests__/plan-run-set.test.ts`
- Modify: `packages/engine/src/index.ts` (export the new module)

- [ ] **Step 3.1: Write failing tests**

Create `packages/engine/src/__tests__/plan-run-set.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import { planRunSet, MAX_ROWS_PER_SCHEMA } from '../plan-run-set.js';
import { EngineError } from '../errors.js';

type Schema = Api.components['schemas']['Schema'];
type MirageSet = Api.components['schemas']['Set'];

const primitive = (name: string, faker = 'string.uuid'): Api.components['schemas']['SchemaProp'] => ({
  name,
  type: 'string',
  faker,
});

const schema = (key: string, props: Api.components['schemas']['SchemaProp'][] = []): Schema =>
  ({
    id: `sch_${key}`,
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key,
    name: key,
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    properties: [primitive('id'), ...props],
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as Schema;

const baseSet = (inclusions: { schemaKey: string; count: number }[]): MirageSet =>
  ({
    id: 'set_1',
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key: 'demo',
    name: 'demo',
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    salt: 'salt',
    schemas: inclusions,
    strategies: [],
    output: { format: 'ndjson', locale: 'en', workerPool: 1 },
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as MirageSet;

describe('planRunSet', () => {
  it('returns topo order and totals for a simple acyclic set', () => {
    const schemas = [schema('a'), schema('b', [primitive('aRef', '$ref:a')])];
    const set = baseSet([
      { schemaKey: 'a', count: 10 },
      { schemaKey: 'b', count: 5 },
    ]);
    const plan = planRunSet({ set, schemas });
    expect(plan.order).toEqual(['a', 'b']);
    expect(plan.perSchema).toEqual([
      { schemaKey: 'a', count: 10 },
      { schemaKey: 'b', count: 5 },
    ]);
    expect(plan.totalRows).toBe(15);
  });

  it('throws cycle_in_set when a cycle exists', () => {
    const schemas = [
      schema('a', [primitive('bRef', '$ref:b')]),
      schema('b', [primitive('aRef', '$ref:a')]),
    ];
    const set = baseSet([
      { schemaKey: 'a', count: 1 },
      { schemaKey: 'b', count: 1 },
    ]);
    expect(() => planRunSet({ set, schemas })).toThrow(EngineError);
    try {
      planRunSet({ set, schemas });
    } catch (err) {
      expect((err as EngineError).code).toBe('cycle_in_set');
    }
  });

  it('throws schema_missing when an inclusion references an unknown schema', () => {
    const schemas = [schema('a')];
    const set = baseSet([{ schemaKey: 'ghost', count: 1 }]);
    expect(() => planRunSet({ set, schemas })).toThrow(/schema_missing/);
  });

  it('throws count_too_large when count exceeds MAX_ROWS_PER_SCHEMA', () => {
    const schemas = [schema('a')];
    const set = baseSet([{ schemaKey: 'a', count: MAX_ROWS_PER_SCHEMA + 1 }]);
    expect(() => planRunSet({ set, schemas })).toThrow(/count_too_large/);
  });

  it('accepts count exactly at MAX_ROWS_PER_SCHEMA', () => {
    const schemas = [schema('a')];
    const set = baseSet([{ schemaKey: 'a', count: MAX_ROWS_PER_SCHEMA }]);
    const plan = planRunSet({ set, schemas });
    expect(plan.totalRows).toBe(MAX_ROWS_PER_SCHEMA);
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
pnpm -F @mirage/engine test -- plan-run-set
```

Expected: FAIL — `Cannot find module '../plan-run-set.js'`.

- [ ] **Step 3.3: Implement `planRunSet`**

Create `packages/engine/src/plan-run-set.ts`:

```ts
import type { Api } from '@mirage/types';
import { EngineError } from './errors.js';
import { extractSetEdges } from './extract-set-edges.js';
import { detectCycles, topoSort } from './topology.js';

type MirageSet = Api.components['schemas']['Set'];
type Schema = Api.components['schemas']['Schema'];

export const MAX_ROWS_PER_SCHEMA = 1_000_000;

export interface RunSetPlan {
  /** Topo order of schemaKeys: each key only after every key it references. */
  order: ReadonlyArray<string>;
  /** Inclusion order from the Set, with validated count values. */
  perSchema: ReadonlyArray<{ schemaKey: string; count: number }>;
  /** Σ count across all inclusions. */
  totalRows: number;
}

export interface PlanRunSetParams {
  set: MirageSet;
  schemas: ReadonlyArray<Schema>;
}

/**
 * Synchronous, pure. Validates a Set against its workspace schemas and
 * computes the generation plan (topo order + totals).
 *
 * Throws `EngineError` with one of:
 *   - 'schema_missing'   — an inclusion references a schema not in `schemas`
 *   - 'count_too_large'  — count exceeds MAX_ROWS_PER_SCHEMA
 *   - 'cycle_in_set'     — at least one cycle exists across included schemas
 */
export function planRunSet(params: PlanRunSetParams): RunSetPlan {
  const { set, schemas } = params;

  for (const inc of set.schemas) {
    if (!schemas.some((s) => s.key === inc.schemaKey)) {
      throw new EngineError('schema_missing', { schemaKey: inc.schemaKey });
    }
    if (!Number.isInteger(inc.count) || inc.count < 0) {
      throw new EngineError('count_invalid', { schemaKey: inc.schemaKey, count: inc.count });
    }
    if (inc.count > MAX_ROWS_PER_SCHEMA) {
      throw new EngineError('count_too_large', {
        schemaKey: inc.schemaKey,
        count: inc.count,
        max: MAX_ROWS_PER_SCHEMA,
      });
    }
  }

  const includedKeys = new Set(set.schemas.map((s) => s.schemaKey));
  const edges = extractSetEdges(schemas, includedKeys);
  const cycles = detectCycles(includedKeys, edges);
  if (cycles.length > 0) {
    throw new EngineError('cycle_in_set', { cycles });
  }

  const order = topoSort(includedKeys, edges);
  const perSchema = set.schemas.map((inc) => ({ schemaKey: inc.schemaKey, count: inc.count }));
  const totalRows = perSchema.reduce((acc, inc) => acc + inc.count, 0);

  return { order, perSchema, totalRows };
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
pnpm -F @mirage/engine test -- plan-run-set
```

Expected: PASS — 5 tests.

- [ ] **Step 3.5: Export from index**

Edit `packages/engine/src/index.ts` — add the export:

```ts
export * from './plan-run-set.js';
```

(Place after the `topology.js` export to keep the alphabetical-ish ordering.)

- [ ] **Step 3.6: Checkpoint**

```bash
pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine lint && pnpm -F @mirage/engine test
```

Expected: all pass.

---

## Task 4: Strategy resolver factory — non-`custom` strategies

Refactor `applyStrategy` (currently "operates on full arrays") into `createStrategyResolver`, a factory that returns a per-source-index function. This is the heart of streaming — strategies must answer "what does source row `i` reference?" without seeing the full target array.

Memory shape per strategy:
- `1:1`, `evenSplit`, `random` with `toFieldPath` undefined: only target *count* needed; target `__id` at index `j` is `${salt}:${targetKey}:${j}`.
- `1:1`, `evenSplit`, `random` with `toFieldPath` set: caller passes a `targetProjection(j) => unknown` lookup (the streaming orchestrator collects projected column values as it generates the target schema).
- `custom`: not in this task; handled in Task 5.

Determinism for `random`: per-source-row seeded RNG keyed by `(salt, fromSchemaKey, fromFieldPath, sourceIndex)` so each row's draw is reproducible without retaining state across rows.

For `random` cardinality `many distinct`: use Floyd's algorithm for O(k) draw-without-replacement.

**Files:**
- Create: `packages/engine/src/strategy-resolver.ts`
- Create: `packages/engine/src/__tests__/strategy-resolver.test.ts`

- [ ] **Step 4.1: Write failing tests — `1:1` and `evenSplit`**

Create `packages/engine/src/__tests__/strategy-resolver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import { createStrategyResolver } from '../strategy-resolver.js';
import type { SetEdge } from '../extract-set-edges.js';

type Strategy = Api.components['schemas']['Strategy'];

const edge = (overrides: Partial<SetEdge> = {}): SetEdge => ({
  fromSchemaKey: 'src',
  fromFieldPath: 'targetRef',
  toSchemaKey: 'tgt',
  cardinality: 'one',
  ...overrides,
});

const idFor = (salt: string, key: string, i: number): string => `${salt}:${key}:${i}`;

describe('createStrategyResolver — 1:1', () => {
  it('returns target __id at the same index when no toFieldPath', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: '1:1' } as Strategy,
      edge: edge(),
      sourceCount: 3,
      targetCount: 3,
      salt: 's',
    });
    expect(resolver(0)).toBe(idFor('s', 'tgt', 0));
    expect(resolver(2)).toBe(idFor('s', 'tgt', 2));
  });

  it('throws when source.count !== target.count', async () => {
    await expect(
      createStrategyResolver({
        strategy: { type: '1:1' } as Strategy,
        edge: edge(),
        sourceCount: 3,
        targetCount: 5,
        salt: 's',
      }),
    ).rejects.toThrow(/strategy_11_count_mismatch/);
  });

  it('projects through targetProjection when toFieldPath set', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: '1:1' } as Strategy,
      edge: edge({ toFieldPath: 'email' }),
      sourceCount: 2,
      targetCount: 2,
      salt: 's',
      targetProjection: (i) => `user${i}@example.com`,
    });
    expect(resolver(0)).toBe('user0@example.com');
    expect(resolver(1)).toBe('user1@example.com');
  });
});

describe('createStrategyResolver — evenSplit', () => {
  it('cycles target ids when source > target (one)', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: 'evenSplit' } as Strategy,
      edge: edge(),
      sourceCount: 5,
      targetCount: 2,
      salt: 's',
    });
    expect(resolver(0)).toBe(idFor('s', 'tgt', 0));
    expect(resolver(1)).toBe(idFor('s', 'tgt', 1));
    expect(resolver(2)).toBe(idFor('s', 'tgt', 0));
    expect(resolver(4)).toBe(idFor('s', 'tgt', 0));
  });

  it('returns k target ids per source row (many)', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: 'evenSplit' } as Strategy,
      edge: edge({ cardinality: 'many' }),
      sourceCount: 2,
      targetCount: 6,
      salt: 's',
      many: { min: 1, max: 5 },
    });
    expect(resolver(0)).toEqual([
      idFor('s', 'tgt', 0),
      idFor('s', 'tgt', 1),
      idFor('s', 'tgt', 2),
    ]);
    expect(resolver(1)).toEqual([
      idFor('s', 'tgt', 3),
      idFor('s', 'tgt', 4),
      idFor('s', 'tgt', 5),
    ]);
  });
});
```

- [ ] **Step 4.2: Run tests — they fail**

```bash
pnpm -F @mirage/engine test -- strategy-resolver
```

Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement non-custom resolver skeleton**

Create `packages/engine/src/strategy-resolver.ts`:

```ts
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { EngineError } from './errors.js';
import { hashSeed, mulberry32 } from './rng.js';
import type { SetEdge } from './extract-set-edges.js';
import type { ResolvedRow } from './resolve-schema.js';

type Strategy = Api.components['schemas']['Strategy'];

/**
 * Resolver returned by createStrategyResolver. Pure-ish — does not allocate
 * shared state between calls beyond what was captured at factory time.
 * For cardinality 'one', returns the projected target value.
 * For cardinality 'many', returns an array of projected target values.
 */
export type StrategyResolver = (sourceIndex: number) => unknown;

export interface CreateStrategyResolverParams {
  strategy: Strategy;
  edge: SetEdge;
  sourceCount: number;
  targetCount: number;
  /** When `edge.toFieldPath` is set, used to look up the projected value at target index. Throws if missing. */
  targetProjection?: (targetIndex: number) => unknown;
  /** Required for custom strategies; ignored otherwise. */
  sourceRows?: ReadonlyArray<ResolvedRow>;
  targetRows?: ReadonlyArray<ResolvedRow>;
  many?: { min: number; max: number };
  salt: string;
  customFunctions?: CustomFunctionRegistry;
  sandbox?: SandboxPool;
}

const targetIdFor = (salt: string, schemaKey: string, i: number): string =>
  `${salt}:${schemaKey}:${i}`;

export async function createStrategyResolver(
  params: CreateStrategyResolverParams,
): Promise<StrategyResolver> {
  const { strategy, edge, sourceCount, targetCount, targetProjection, salt, many } = params;

  const projectAt = (targetIndex: number): unknown =>
    edge.toFieldPath ? targetProjection!(targetIndex) : targetIdFor(salt, edge.toSchemaKey, targetIndex);

  if (strategy.type === '1:1') {
    if (edge.cardinality !== 'one') {
      throw new EngineError('strategy_11_cardinality', {
        fromSchemaKey: edge.fromSchemaKey,
        fromFieldPath: edge.fromFieldPath,
        cardinality: edge.cardinality,
      });
    }
    if (sourceCount !== targetCount) {
      throw new EngineError('strategy_11_count_mismatch', {
        fromSchemaKey: edge.fromSchemaKey,
        fromFieldPath: edge.fromFieldPath,
        source: sourceCount,
        target: targetCount,
      });
    }
    return (i: number) => projectAt(i);
  }

  if (strategy.type === 'evenSplit') {
    if (targetCount === 0) {
      throw new EngineError('strategy_no_targets', {
        fromSchemaKey: edge.fromSchemaKey,
        fromFieldPath: edge.fromFieldPath,
      });
    }
    if (edge.cardinality === 'one') {
      return (i: number) => projectAt(i % targetCount);
    }
    const range = many ?? { min: 1, max: 1 };
    const k = clampInt(Math.round(targetCount / Math.max(1, sourceCount)), range.min, range.max);
    return (i: number) => {
      const out: unknown[] = [];
      for (let j = 0; j < k; j++) {
        out.push(projectAt((i * k + j) % targetCount));
      }
      return out;
    };
  }

  if (strategy.type === 'random') {
    return makeRandomResolver({ ...params, projectAt });
  }

  if (strategy.type === 'custom') {
    return makeCustomResolver({ ...params, projectAt });
  }

  throw new EngineError('strategy_unknown', {
    fromSchemaKey: edge.fromSchemaKey,
    fromFieldPath: edge.fromFieldPath,
    strategy,
  });
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

// ---------- random ----------

interface RandomCtx extends CreateStrategyResolverParams {
  projectAt: (targetIndex: number) => unknown;
}

function makeRandomResolver(ctx: RandomCtx): StrategyResolver {
  const { strategy, edge, targetCount, salt, many, projectAt } = ctx;
  if (targetCount === 0) {
    throw new EngineError('strategy_no_targets', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
    });
  }
  const baseSeedParts = [salt, edge.fromSchemaKey, edge.fromFieldPath] as const;

  if (edge.cardinality === 'one') {
    return (i: number) => {
      const rng = mulberry32(hashSeed(...baseSeedParts, String(i)));
      const idx = Math.floor(rng() * targetCount);
      return projectAt(idx);
    };
  }

  const allowDuplicates = (strategy as { allowDuplicates?: boolean }).allowDuplicates !== false;
  const range = many ?? { min: 1, max: 1 };

  return (i: number) => {
    const rng = mulberry32(hashSeed(...baseSeedParts, String(i)));
    const k = clampInt(
      range.min + Math.floor(rng() * (range.max - range.min + 1)),
      0,
      targetCount,
    );
    if (k === 0) return [];
    if (allowDuplicates) {
      const out: unknown[] = [];
      for (let j = 0; j < k; j++) {
        out.push(projectAt(Math.floor(rng() * targetCount)));
      }
      return out;
    }
    // Floyd's algorithm: O(k) draw-without-replacement from [0, targetCount).
    const chosen = new Set<number>();
    const limit = Math.min(k, targetCount);
    for (let j = targetCount - limit; j < targetCount; j++) {
      const t = Math.floor(rng() * (j + 1));
      chosen.add(chosen.has(t) ? j : t);
    }
    return Array.from(chosen, projectAt);
  };
}

// ---------- custom — implemented in Task 5 ----------

function makeCustomResolver(_ctx: RandomCtx): StrategyResolver {
  throw new EngineError('strategy_unknown', { reason: 'custom not implemented in this task' });
}
```

- [ ] **Step 4.4: Run tests — they pass**

```bash
pnpm -F @mirage/engine test -- strategy-resolver
```

Expected: PASS — the 1:1 and evenSplit tests pass. Custom is still stub.

- [ ] **Step 4.5: Add random strategy tests**

Append to `packages/engine/src/__tests__/strategy-resolver.test.ts`:

```ts
describe('createStrategyResolver — random one', () => {
  it('is deterministic for the same (salt, edge, sourceIndex)', async () => {
    const make = () =>
      createStrategyResolver({
        strategy: { type: 'random' } as Strategy,
        edge: edge(),
        sourceCount: 10,
        targetCount: 4,
        salt: 's',
      });
    const a = await make();
    const b = await make();
    for (let i = 0; i < 10; i++) {
      expect(a(i)).toBe(b(i));
    }
  });

  it('only returns ids within [0, targetCount)', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: 'random' } as Strategy,
      edge: edge(),
      sourceCount: 100,
      targetCount: 5,
      salt: 's',
    });
    const valid = new Set(Array.from({ length: 5 }, (_, j) => idFor('s', 'tgt', j)));
    for (let i = 0; i < 100; i++) {
      expect(valid.has(resolver(i) as string)).toBe(true);
    }
  });
});

describe('createStrategyResolver — random many distinct', () => {
  it('produces arrays with no duplicates and length <= min(k, targetCount)', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: 'random', allowDuplicates: false } as Strategy,
      edge: edge({ cardinality: 'many' }),
      sourceCount: 50,
      targetCount: 3,
      salt: 's',
      many: { min: 2, max: 5 },
    });
    for (let i = 0; i < 50; i++) {
      const v = resolver(i) as string[];
      expect(v.length).toBeLessThanOrEqual(3);
      expect(new Set(v).size).toBe(v.length);
    }
  });

  it('may contain duplicates when allowDuplicates is true', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: 'random', allowDuplicates: true } as Strategy,
      edge: edge({ cardinality: 'many' }),
      sourceCount: 50,
      targetCount: 2,
      salt: 's',
      many: { min: 5, max: 5 },
    });
    let sawDup = false;
    for (let i = 0; i < 50 && !sawDup; i++) {
      const v = resolver(i) as string[];
      sawDup = new Set(v).size < v.length;
    }
    expect(sawDup).toBe(true);
  });
});
```

- [ ] **Step 4.6: Run all strategy-resolver tests**

```bash
pnpm -F @mirage/engine test -- strategy-resolver
```

Expected: PASS — all tests including random.

- [ ] **Step 4.7: Add resolver export to index**

Edit `packages/engine/src/index.ts` and append:

```ts
export * from './strategy-resolver.js';
```

- [ ] **Step 4.8: Checkpoint**

```bash
pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine lint && pnpm -F @mirage/engine test
```

Expected: all pass.

---

## Task 5: Strategy resolver — `custom` fallback path

`custom` strategies receive `sourceRows` and `targetRows` as full arrays (the user-written JS function expects this shape). The streaming orchestrator detects custom edges during `runSetStream` setup and falls back to materialising the involved schemas. The resolver then pre-computes the full result array and returns it via index lookup.

**Files:**
- Modify: `packages/engine/src/strategy-resolver.ts` (replace the `makeCustomResolver` stub).
- Modify: `packages/engine/src/__tests__/strategy-resolver.test.ts` (add custom tests).

- [ ] **Step 5.1: Write failing tests**

Append to `packages/engine/src/__tests__/strategy-resolver.test.ts`:

```ts
import { createCustomFunctionRegistry } from '../custom-function-registry.js';

describe('createStrategyResolver — custom (one)', () => {
  it('returns the projected value from the user function result', async () => {
    const fakeSandbox = {
      invoke: async (_src: string, ctx: { sourceRows: ResolvedRow[]; targetRows: ResolvedRow[] }) =>
        ctx.sourceRows.map((_, i) => ctx.targetRows[i % ctx.targetRows.length]!.__id),
    } as unknown as Parameters<typeof createStrategyResolver>[0]['sandbox'];

    const registry = createCustomFunctionRegistry([
      {
        id: 'cfn_1234567890abcdef',
        name: 'pick',
        usage: 'strategy',
        source: 'return ctx.sourceRows.map((_,i)=>ctx.targetRows[i].__id);',
      },
    ]);

    const sourceRows: ResolvedRow[] = Array.from({ length: 3 }, (_, i) => ({
      __schemaKey: 'src',
      __id: `s:src:${i}`,
    }));
    const targetRows: ResolvedRow[] = Array.from({ length: 3 }, (_, i) => ({
      __schemaKey: 'tgt',
      __id: `s:tgt:${i}`,
    }));

    const resolver = await createStrategyResolver({
      strategy: { type: 'custom', functionId: 'cfn_1234567890abcdef' } as Strategy,
      edge: edge(),
      sourceCount: 3,
      targetCount: 3,
      sourceRows,
      targetRows,
      salt: 's',
      customFunctions: registry,
      sandbox: fakeSandbox,
    });

    expect(resolver(0)).toBe('s:tgt:0');
    expect(resolver(1)).toBe('s:tgt:1');
    expect(resolver(2)).toBe('s:tgt:2');
  });

  it('throws fn_target_missing when functionId is unknown', async () => {
    const fakeSandbox = { invoke: async () => [] } as unknown as Parameters<
      typeof createStrategyResolver
    >[0]['sandbox'];
    const registry = createCustomFunctionRegistry([]);
    await expect(
      createStrategyResolver({
        strategy: { type: 'custom', functionId: 'cfn_does_not_exist00' } as Strategy,
        edge: edge(),
        sourceCount: 1,
        targetCount: 1,
        sourceRows: [{ __schemaKey: 'src', __id: 's:src:0' }],
        targetRows: [{ __schemaKey: 'tgt', __id: 's:tgt:0' }],
        salt: 's',
        customFunctions: registry,
        sandbox: fakeSandbox,
      }),
    ).rejects.toThrow(/fn_target_missing/);
  });
});
```

Also add the import at the top of the test file (next to existing imports):

```ts
import type { ResolvedRow } from '../resolve-schema.js';
```

- [ ] **Step 5.2: Verify the tests fail**

```bash
pnpm -F @mirage/engine test -- strategy-resolver
```

Expected: FAIL — the custom-strategy test throws "custom not implemented in this task".

- [ ] **Step 5.3: Implement `makeCustomResolver`**

Edit `packages/engine/src/strategy-resolver.ts`. Replace the stub with:

```ts
async function makeCustomResolver(ctx: RandomCtx): Promise<StrategyResolver> {
  const {
    strategy,
    edge,
    sourceRows,
    targetRows,
    salt,
    customFunctions,
    sandbox,
    projectAt: _projectAt,
  } = ctx;
  const fnId = (strategy as { functionId?: string }).functionId;
  if (typeof fnId !== 'string' || fnId.length === 0) {
    throw new EngineError('strategy_custom_missing_fn', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
    });
  }
  if (!customFunctions) {
    throw new EngineError('strategy_custom_missing_registry', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
    });
  }
  const entry = customFunctions.get(fnId);
  if (!entry) {
    throw new EngineError('fn_target_missing', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
      functionId: fnId,
    });
  }
  if (entry.usage === 'valueGenerator') {
    throw new EngineError('fn_usage_mismatch', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
      functionId: fnId,
      usage: entry.usage,
    });
  }
  if (!sandbox) {
    throw new EngineError('strategy_custom_missing_sandbox', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
    });
  }
  if (!sourceRows || !targetRows) {
    throw new EngineError('strategy_custom_missing_rows', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
    });
  }

  const callerCtx = {
    sourceRows,
    targetRows,
    cardinality: edge.cardinality,
    __rngSeed: hashSeed(salt, edge.fromSchemaKey, edge.fromFieldPath, 'strategy'),
    salt,
  };
  const raw = await sandbox.invoke(entry.source, callerCtx);
  if (!validateCustomResult(raw, edge.cardinality, sourceRows.length)) {
    throw new EngineError('strategy_custom_bad_shape', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
      functionId: fnId,
      cardinality: edge.cardinality,
    });
  }

  // Map the returned __id strings to projected values via the index lookup the
  // orchestrator pre-built. Targets aren't necessarily addressed by index in
  // a custom function (they may return any subset of __ids), so build a Map.
  const idToProjected = new Map<string, unknown>();
  for (let j = 0; j < targetRows.length; j++) {
    idToProjected.set(targetRows[j]!.__id, edge.toFieldPath ? getByPath(targetRows[j]!, edge.toFieldPath) : targetRows[j]!.__id);
  }

  if (edge.cardinality === 'one') {
    const arr = raw as string[];
    return (i: number) => idToProjected.get(arr[i]!) ?? arr[i]!;
  }
  const arr = raw as string[][];
  return (i: number) => arr[i]!.map((id) => idToProjected.get(id) ?? id);
}

function validateCustomResult(
  result: unknown,
  cardinality: 'one' | 'many',
  expectedLength: number,
): boolean {
  if (!Array.isArray(result) || result.length !== expectedLength) return false;
  if (cardinality === 'one') return result.every((x) => typeof x === 'string');
  return result.every(
    (x) => Array.isArray(x) && (x as unknown[]).every((y) => typeof y === 'string'),
  );
}

function getByPath(row: Record<string, unknown>, path: string): unknown {
  let cur: unknown = row;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
```

Change the dispatch line from sync `return makeCustomResolver(...)` to `return await makeCustomResolver(...)`:

```ts
  if (strategy.type === 'custom') {
    return await makeCustomResolver({ ...params, projectAt });
  }
```

- [ ] **Step 5.4: Run tests — they pass**

```bash
pnpm -F @mirage/engine test -- strategy-resolver
```

Expected: PASS — all strategy-resolver tests including the new custom ones.

- [ ] **Step 5.5: Checkpoint**

```bash
pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine lint && pnpm -F @mirage/engine test
```

Expected: all pass.

---

## Task 6: Add async row generator for a single schema

`generateRows` is an `async function*` that yields one `ResolvedRow` at a time for a single schema. Same sequence of faker calls as the existing `resolveSchema`, so output is byte-identical for the same inputs.

The old `resolveSchema` becomes a thin wrapper that drains the generator into an array (for back-compat with any other caller).

**Files:**
- Create: `packages/engine/src/generate-rows.ts`
- Create: `packages/engine/src/__tests__/generate-rows.test.ts`
- Modify: `packages/engine/src/resolve-schema.ts` (delegate to `generate-rows.ts`).

- [ ] **Step 6.1: Write failing test**

Create `packages/engine/src/__tests__/generate-rows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import { generateRows } from '../generate-rows.js';
import { resolveSchema } from '../resolve-schema.js';
import { createCustomFunctionRegistry } from '../custom-function-registry.js';

type Schema = Api.components['schemas']['Schema'];

const schema = (props: Api.components['schemas']['SchemaProp'][]): Schema =>
  ({
    id: 'sch_x',
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key: 'x',
    name: 'x',
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    properties: props,
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as Schema;

const fakeSandbox = {
  invoke: async () => null,
} as unknown as Parameters<typeof generateRows>[0]['sandbox'];

describe('generateRows', () => {
  it('produces the same rows as resolveSchema for the same inputs', async () => {
    const sch = schema([
      { name: 'id', type: 'string', faker: 'string.uuid' },
      { name: 'name', type: 'string', faker: 'person.firstName' },
    ]);
    const params = {
      schema: sch,
      count: 4,
      salt: 'salt',
      locale: 'en',
      customFunctions: createCustomFunctionRegistry([]),
      sandbox: fakeSandbox,
    };
    const fromIterator: unknown[] = [];
    for await (const row of generateRows(params)) fromIterator.push(row);
    const fromArray = await resolveSchema(params);
    expect(fromIterator).toEqual(fromArray);
  });

  it('yields exactly count rows', async () => {
    const sch = schema([{ name: 'id', type: 'string', faker: 'string.uuid' }]);
    const params = {
      schema: sch,
      count: 7,
      salt: 'salt',
      locale: 'en',
      customFunctions: createCustomFunctionRegistry([]),
      sandbox: fakeSandbox,
    };
    let n = 0;
    for await (const _row of generateRows(params)) n++;
    expect(n).toBe(7);
  });

  it('emits __id with the salt:schemaKey:index pattern', async () => {
    const sch = schema([{ name: 'id', type: 'string', faker: 'string.uuid' }]);
    const ids: string[] = [];
    for await (const row of generateRows({
      schema: sch,
      count: 3,
      salt: 'S',
      locale: 'en',
      customFunctions: createCustomFunctionRegistry([]),
      sandbox: fakeSandbox,
    })) {
      ids.push(row.__id);
    }
    expect(ids).toEqual(['S:x:0', 'S:x:1', 'S:x:2']);
  });
});
```

- [ ] **Step 6.2: Run tests — they fail**

```bash
pnpm -F @mirage/engine test -- generate-rows
```

Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement `generateRows`**

Create `packages/engine/src/generate-rows.ts`:

```ts
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { createFakerEngine } from './faker-engine.js';
import { EngineError } from './errors.js';
import { hashSeed, mulberry32 } from './rng.js';
import type { RefPlaceholder, ResolvedRow } from './resolve-schema.js';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;
const FN_RE = /^\$fn:(cfn_[A-Za-z0-9_-]{16})$/;
const DEFAULT_ARRAY_LENGTH = 3;

export interface GenerateRowsParams {
  schema: Schema;
  count: number;
  salt: string;
  locale: string;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

export async function* generateRows(params: GenerateRowsParams): AsyncIterable<ResolvedRow> {
  const { schema, count, salt, locale, customFunctions, sandbox } = params;
  if (!Number.isInteger(count) || count < 0) {
    throw new EngineError('resolve_schema_bad_count', { count });
  }

  // One faker engine per schema. State is consumed in row order so the
  // resulting sequence is identical whether we generate all at once or in
  // batches. Do not reseed inside the loop.
  const fakerEngine = createFakerEngine(locale);
  fakerEngine.seed(hashSeed(salt, schema.key));

  for (let i = 0; i < count; i++) {
    const rowId = `${salt}:${schema.key}:${i}`;
    const rowRng = mulberry32(hashSeed(salt, schema.key, String(i)));
    const fields: Record<string, unknown> = {};
    for (const p of schema.properties) {
      fields[p.name] = await resolveProp(p, {
        schemaKey: schema.key,
        fakerEngine,
        rowRng,
        salt,
        locale,
        rowIndex: i,
        customFunctions,
        sandbox,
        fieldPath: p.name,
      });
    }
    yield { __schemaKey: schema.key, __id: rowId, ...fields };
  }
}

interface ResolvePropContext {
  schemaKey: string;
  fakerEngine: ReturnType<typeof createFakerEngine>;
  rowRng: () => number;
  salt: string;
  locale: string;
  rowIndex: number;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
  fieldPath: string;
}

async function resolveProp(p: SchemaProp, ctx: ResolvePropContext): Promise<unknown> {
  if (p.type === 'object') {
    const obj: Record<string, unknown> = {};
    const fields = Array.isArray(p.fields) ? p.fields : [];
    for (const f of fields) {
      obj[f.name] = await resolveProp(f, { ...ctx, fieldPath: `${ctx.fieldPath}.${f.name}` });
    }
    return obj;
  }
  if (p.type === 'array') {
    if (!p.items) return [];
    const out: unknown[] = [];
    for (let k = 0; k < DEFAULT_ARRAY_LENGTH; k++) {
      out.push(
        await resolveProp(p.items, {
          ...ctx,
          fieldPath: `${ctx.fieldPath}[]${p.items.name ? `.${p.items.name}` : ''}`,
        }),
      );
    }
    return out;
  }
  if (typeof p.faker !== 'string' || p.faker.length === 0) return null;

  const refMatch = p.faker.match(REF_RE);
  if (refMatch) {
    const ref: RefPlaceholder = {
      __ref: true,
      toSchemaKey: refMatch[1]!,
      fromFieldPath: ctx.fieldPath,
    };
    return ref;
  }
  const fnMatch = p.faker.match(FN_RE);
  if (fnMatch) {
    const fnId = fnMatch[1]!;
    const entry = ctx.customFunctions.get(fnId);
    if (!entry) {
      throw new EngineError('fn_target_missing', { fieldPath: ctx.fieldPath, functionId: fnId });
    }
    if (entry.usage === 'strategy') {
      throw new EngineError('fn_usage_mismatch', {
        fieldPath: ctx.fieldPath,
        functionId: fnId,
        usage: entry.usage,
      });
    }
    const seedBase = hashSeed(ctx.salt, ctx.schemaKey, String(ctx.rowIndex), ctx.fieldPath);
    const callerCtx = {
      __fakerSeed: seedBase,
      __fakerLocale: ctx.locale,
      __rngSeed: seedBase ^ 0x9e3779b9,
      salt: ctx.salt,
    };
    return ctx.sandbox.invoke(entry.source, callerCtx);
  }
  return ctx.fakerEngine.call(p.faker);
}
```

- [ ] **Step 6.4: Refactor `resolveSchema` to delegate to `generateRows`**

Edit `packages/engine/src/resolve-schema.ts`. Keep the type exports and replace the function body. Final state:

```ts
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { generateRows } from './generate-rows.js';

type Schema = Api.components['schemas']['Schema'];

export interface RefPlaceholder {
  readonly __ref: true;
  readonly toSchemaKey: string;
  readonly fromFieldPath: string;
}

export function isRefPlaceholder(v: unknown): v is RefPlaceholder {
  return Boolean(v && typeof v === 'object' && (v as { __ref?: unknown }).__ref === true);
}

export interface ResolvedRow {
  readonly __schemaKey: string;
  readonly __id: string;
  readonly [field: string]: unknown;
}

export interface ResolveSchemaParams {
  schema: Schema;
  count: number;
  salt: string;
  locale: string;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

/**
 * Drains `generateRows` into an array. Kept for the very few callers that
 * still want the full materialized array (Task 5 custom strategy fallback,
 * tests). Prefer `generateRows` for streaming.
 */
export async function resolveSchema(params: ResolveSchemaParams): Promise<ResolvedRow[]> {
  const out: ResolvedRow[] = [];
  for await (const row of generateRows(params)) out.push(row);
  return out;
}
```

- [ ] **Step 6.5: Run tests — they pass**

```bash
pnpm -F @mirage/engine test -- generate-rows
```

Expected: PASS — 3 tests.

- [ ] **Step 6.6: Export from index**

Edit `packages/engine/src/index.ts` and append:

```ts
export * from './generate-rows.js';
```

- [ ] **Step 6.7: Checkpoint**

```bash
pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine lint && pnpm -F @mirage/engine test
```

Expected: all pass. The old `resolveSchema` behaviour is preserved via delegation.

---

## Task 7: Add `runSetStream` — the streaming orchestrator

The heart of the change. Walks the topo order from the plan; for each schema, drains `generateRows` in batches; substitutes refs using `createStrategyResolver`; yields one `RowBatch` per batch.

Key state management:
- For each schema *S* in topo order, before generating *S*'s rows, build resolvers for every outgoing edge from *S* using already-generated targets' state.
- For schemas referenced via `toFieldPath`, retain the projected-column array as we go.
- For schemas referenced by a `custom` strategy from any source, buffer the full rows (fallback path).

**Files:**
- Create: `packages/engine/src/run-set-stream.ts`
- Create: `packages/engine/src/__tests__/run-set-stream.test.ts`
- Modify: `packages/engine/src/index.ts` (export)

- [ ] **Step 7.1: Write failing test — single schema, no refs**

Create `packages/engine/src/__tests__/run-set-stream.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import { runSetStream } from '../run-set-stream.js';
import { createCustomFunctionRegistry } from '../custom-function-registry.js';

type Schema = Api.components['schemas']['Schema'];
type MirageSet = Api.components['schemas']['Set'];

const fakeSandbox = { invoke: async () => null } as unknown as Parameters<typeof runSetStream>[0]['sandbox'];

const schema = (key: string, props: Api.components['schemas']['SchemaProp'][]): Schema =>
  ({
    id: `sch_${key}`,
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key,
    name: key,
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    properties: props,
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as Schema;

const buildSet = (
  schemas: { schemaKey: string; count: number }[],
  strategies: Api.components['schemas']['StrategyOverride'][] = [],
): MirageSet =>
  ({
    id: 'set_1',
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key: 'k',
    name: 'k',
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    salt: 'S',
    schemas,
    strategies,
    output: { format: 'ndjson', locale: 'en', workerPool: 1 },
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as MirageSet;

describe('runSetStream — single schema', () => {
  it('yields batches with the right totals', async () => {
    const schemas = [schema('a', [{ name: 'id', type: 'string', faker: 'string.uuid' }])];
    const set = buildSet([{ schemaKey: 'a', count: 7 }]);
    const batches = [];
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: createCustomFunctionRegistry([]),
      sandbox: fakeSandbox,
      batchSize: 3,
    })) {
      batches.push(b);
    }
    expect(batches.map((b) => b.rows.length)).toEqual([3, 3, 1]);
    expect(batches.at(-1)!.totalProduced).toBe(7);
    expect(batches.at(-1)!.totalRows).toBe(7);
    expect(batches.every((b) => b.schemaKey === 'a')).toBe(true);
  });
});
```

- [ ] **Step 7.2: Run tests — they fail**

```bash
pnpm -F @mirage/engine test -- run-set-stream
```

Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement `runSetStream` skeleton**

Create `packages/engine/src/run-set-stream.ts`:

```ts
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { EngineError } from './errors.js';
import { extractSetEdges, type SetEdge } from './extract-set-edges.js';
import { generateRows } from './generate-rows.js';
import { planRunSet } from './plan-run-set.js';
import { createStrategyResolver, type StrategyResolver } from './strategy-resolver.js';
import { isRefPlaceholder, type ResolvedRow } from './resolve-schema.js';

type MirageSet = Api.components['schemas']['Set'];
type Schema = Api.components['schemas']['Schema'];

export interface RowBatch {
  schemaKey: string;
  rows: ReadonlyArray<ResolvedRow>;
  schemaProduced: number;
  schemaTotal: number;
  totalProduced: number;
  totalRows: number;
}

export interface RunSetStreamParams {
  set: MirageSet;
  schemas: ReadonlyArray<Schema>;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
  batchSize?: number;
  signal?: AbortSignal;
}

export class CancelledError extends Error {
  override readonly name = 'CancelledError';
}

const DEFAULT_BATCH_SIZE = 500;

export async function* runSetStream(params: RunSetStreamParams): AsyncIterable<RowBatch> {
  const { set, schemas, customFunctions, sandbox, signal } = params;
  const batchSize = Math.max(1, params.batchSize ?? DEFAULT_BATCH_SIZE);

  const plan = planRunSet({ set, schemas });
  const includedKeys = new Set(plan.order);
  const allEdges = extractSetEdges(schemas, includedKeys);
  const edgesByFrom = groupBy(allEdges, (e) => e.fromSchemaKey);
  const countByKey = new Map(plan.perSchema.map((p) => [p.schemaKey, p.count] as const));

  // Pre-compute which schemas must be fully materialised because they
  // participate (as source OR target) in any custom-strategy edge, and which
  // schemas need a per-field projection column retained.
  const customSchemas = new Set<string>();
  const projectionsNeeded = new Map<string, Set<string>>(); // schemaKey → set of fieldPaths
  for (const e of allEdges) {
    const override = strategyFor(set, e);
    if (override.type === 'custom') {
      customSchemas.add(e.fromSchemaKey);
      customSchemas.add(e.toSchemaKey);
    }
    if (e.toFieldPath) {
      if (!projectionsNeeded.has(e.toSchemaKey)) {
        projectionsNeeded.set(e.toSchemaKey, new Set());
      }
      projectionsNeeded.get(e.toSchemaKey)!.add(e.toFieldPath);
    }
  }

  // Per-schema retained state as we walk the topo order.
  const materialisedRows = new Map<string, ResolvedRow[]>();
  const projectedColumns = new Map<string, Map<string, unknown[]>>(); // schemaKey → fieldPath → values

  let totalProduced = 0;
  const totalRows = plan.totalRows;

  for (const schemaKey of plan.order) {
    if (signal?.aborted) throw new CancelledError();

    const schema = schemas.find((s) => s.key === schemaKey)!;
    const schemaTotal = countByKey.get(schemaKey) ?? 0;

    // Build a resolver per outgoing edge from this schema.
    const outgoing = edgesByFrom.get(schemaKey) ?? [];
    const resolvers = new Map<string, StrategyResolver>();
    for (const e of outgoing) {
      const override = strategyFor(set, e);
      const targetCount = countByKey.get(e.toSchemaKey) ?? 0;
      const targetProjection =
        e.toFieldPath !== undefined
          ? (idx: number) => projectedColumns.get(e.toSchemaKey)?.get(e.toFieldPath!)?.[idx]
          : undefined;

      const resolver = await createStrategyResolver({
        strategy: override,
        edge: e,
        sourceCount: schemaTotal,
        targetCount,
        ...(targetProjection ? { targetProjection } : {}),
        ...(customSchemas.has(e.fromSchemaKey) || customSchemas.has(e.toSchemaKey)
          ? {
              sourceRows: customSchemas.has(e.fromSchemaKey)
                ? await materialiseSchema(e.fromSchemaKey, {
                    schemas,
                    countByKey,
                    customFunctions,
                    sandbox,
                    salt: set.salt,
                    locale: set.output.locale,
                    cache: materialisedRows,
                  })
                : undefined,
              targetRows: await materialiseSchema(e.toSchemaKey, {
                schemas,
                countByKey,
                customFunctions,
                sandbox,
                salt: set.salt,
                locale: set.output.locale,
                cache: materialisedRows,
              }),
            }
          : {}),
        many: e.cardinality === 'many' ? { min: 1, max: 3 } : undefined,
        salt: set.salt,
        customFunctions,
        sandbox,
      });
      resolvers.set(edgeKey(e), resolver);
    }

    // Open per-field projection arrays for this schema, if needed.
    const myProjections = projectionsNeeded.get(schemaKey);
    if (myProjections) {
      projectedColumns.set(schemaKey, new Map([...myProjections].map((p) => [p, []])));
    }

    let schemaProduced = 0;
    let buffer: ResolvedRow[] = [];

    for await (const row of generateRows({
      schema,
      count: schemaTotal,
      salt: set.salt,
      locale: set.output.locale,
      customFunctions,
      sandbox,
    })) {
      // Substitute references for outgoing edges.
      const sourceIndex = schemaProduced + buffer.length;
      for (const e of outgoing) {
        const resolver = resolvers.get(edgeKey(e))!;
        const value = resolver(sourceIndex);
        substituteRef(row as Record<string, unknown>, e.fromFieldPath, value);
      }
      buffer.push(row);

      // Record projection columns for downstream consumers.
      if (myProjections) {
        const cols = projectedColumns.get(schemaKey)!;
        for (const fp of myProjections) {
          cols.get(fp)!.push(getByPath(row as Record<string, unknown>, fp));
        }
      }

      if (buffer.length >= batchSize) {
        if (signal?.aborted) throw new CancelledError();
        schemaProduced += buffer.length;
        totalProduced += buffer.length;
        yield {
          schemaKey,
          rows: buffer,
          schemaProduced,
          schemaTotal,
          totalProduced,
          totalRows,
        };
        if (customSchemas.has(schemaKey)) {
          // Materialised path: keep rows. Already pushed into materialisedRows
          // via materialiseSchema when consumed; here we top it up.
          appendMaterialised(materialisedRows, schemaKey, buffer);
        }
        buffer = [];
      }
    }
    if (buffer.length > 0) {
      schemaProduced += buffer.length;
      totalProduced += buffer.length;
      yield {
        schemaKey,
        rows: buffer,
        schemaProduced,
        schemaTotal,
        totalProduced,
        totalRows,
      };
      if (customSchemas.has(schemaKey)) {
        appendMaterialised(materialisedRows, schemaKey, buffer);
      }
      buffer = [];
    }

    if (schemaProduced !== schemaTotal) {
      throw new EngineError('runset_internal', {
        schemaKey,
        schemaProduced,
        schemaTotal,
      });
    }
  }
}

// ---------- helpers ----------

function strategyFor(set: MirageSet, edge: SetEdge): Api.components['schemas']['Strategy'] {
  const override = set.strategies.find(
    (o) => o.schemaKey === edge.fromSchemaKey && o.fieldPath === edge.fromFieldPath,
  );
  return override?.strategy ?? { type: '1:1' };
}

function edgeKey(e: SetEdge): string {
  return `${e.fromSchemaKey}::${e.fromFieldPath}::${e.toSchemaKey}::${e.toFieldPath ?? ''}`;
}

function groupBy<T, K>(arr: ReadonlyArray<T>, k: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const x of arr) {
    const key = k(x);
    let lst = out.get(key);
    if (!lst) {
      lst = [];
      out.set(key, lst);
    }
    lst.push(x);
  }
  return out;
}

function appendMaterialised(
  cache: Map<string, ResolvedRow[]>,
  schemaKey: string,
  rows: ResolvedRow[],
): void {
  const cur = cache.get(schemaKey) ?? [];
  for (const r of rows) cur.push(r);
  cache.set(schemaKey, cur);
}

interface MaterialiseCtx {
  schemas: ReadonlyArray<Schema>;
  countByKey: ReadonlyMap<string, number>;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
  salt: string;
  locale: string;
  cache: Map<string, ResolvedRow[]>;
}

async function materialiseSchema(
  schemaKey: string,
  ctx: MaterialiseCtx,
): Promise<ReadonlyArray<ResolvedRow>> {
  const cached = ctx.cache.get(schemaKey);
  if (cached) return cached;
  const schema = ctx.schemas.find((s) => s.key === schemaKey);
  if (!schema) throw new EngineError('schema_missing', { schemaKey });
  const count = ctx.countByKey.get(schemaKey) ?? 0;
  const rows: ResolvedRow[] = [];
  for await (const r of generateRows({
    schema,
    count,
    salt: ctx.salt,
    locale: ctx.locale,
    customFunctions: ctx.customFunctions,
    sandbox: ctx.sandbox,
  })) {
    rows.push(r);
  }
  ctx.cache.set(schemaKey, rows);
  return rows;
}

// ---------- ref substitution (kept here so run-set.ts can be deleted) ----------

interface PathSegment {
  kind: 'field' | 'arrayItem';
  name?: string;
}

function parsePath(p: string): PathSegment[] {
  const segs: PathSegment[] = [];
  for (const raw of p.split('.')) {
    let cur = raw;
    while (cur.endsWith('[]')) {
      const name = cur.slice(0, -2);
      if (name) segs.push({ kind: 'field', name });
      segs.push({ kind: 'arrayItem' });
      cur = '';
    }
    if (cur) segs.push({ kind: 'field', name: cur });
  }
  return segs;
}

function substituteRef(
  row: Record<string, unknown>,
  fieldPath: string,
  replacement: unknown,
): void {
  walkAndReplace(row, parsePath(fieldPath), 0, replacement);
}

function walkAndReplace(
  node: unknown,
  segs: PathSegment[],
  idx: number,
  replacement: unknown,
): void {
  if (idx >= segs.length) return;
  const seg = segs[idx]!;
  if (seg.kind === 'field') {
    const obj = node as Record<string, unknown>;
    const child = obj[seg.name!];
    if (idx === segs.length - 1) {
      if (isRefPlaceholder(child)) {
        obj[seg.name!] = replacement;
      }
      return;
    }
    walkAndReplace(child, segs, idx + 1, replacement);
  } else {
    if (!Array.isArray(node)) return;
    for (const item of node) {
      walkAndReplace(item, segs, idx + 1, replacement);
    }
  }
}

function getByPath(row: Record<string, unknown>, path: string): unknown {
  let cur: unknown = row;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
```

- [ ] **Step 7.4: Run the single-schema test — passes**

```bash
pnpm -F @mirage/engine test -- run-set-stream
```

Expected: PASS — the single-schema batching test passes.

- [ ] **Step 7.5: Add multi-schema cross-ref test**

Append to `packages/engine/src/__tests__/run-set-stream.test.ts`:

```ts
describe('runSetStream — cross-schema refs', () => {
  it('substitutes a 1:1 reference with the target __id when no toFieldPath', async () => {
    const schemas = [
      schema('person', [{ name: 'id', type: 'string', faker: 'string.uuid' }]),
      schema('mobile', [
        { name: 'id', type: 'string', faker: 'string.uuid' },
        { name: 'personId', type: 'string', faker: '$ref:person' },
      ]),
    ];
    const set = buildSet([
      { schemaKey: 'person', count: 3 },
      { schemaKey: 'mobile', count: 3 },
    ]);
    const rowsByKey = new Map<string, unknown[]>();
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: createCustomFunctionRegistry([]),
      sandbox: fakeSandbox,
      batchSize: 2,
    })) {
      const acc = rowsByKey.get(b.schemaKey) ?? [];
      acc.push(...b.rows);
      rowsByKey.set(b.schemaKey, acc);
    }
    const mobiles = rowsByKey.get('mobile') as Array<{ personId: string }>;
    expect(mobiles.map((m) => m.personId)).toEqual(['S:person:0', 'S:person:1', 'S:person:2']);
  });

  it('projects through toFieldPath when set', async () => {
    const schemas = [
      schema('person', [
        { name: 'id', type: 'string', faker: 'string.uuid' },
        { name: 'email', type: 'string', faker: 'internet.email' },
      ]),
      schema('mobile', [
        { name: 'id', type: 'string', faker: 'string.uuid' },
        { name: 'personEmail', type: 'string', faker: '$ref:person.email' },
      ]),
    ];
    const set = buildSet([
      { schemaKey: 'person', count: 2 },
      { schemaKey: 'mobile', count: 2 },
    ]);
    let persons: Array<{ email: string }> = [];
    let mobiles: Array<{ personEmail: string }> = [];
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: createCustomFunctionRegistry([]),
      sandbox: fakeSandbox,
      batchSize: 10,
    })) {
      if (b.schemaKey === 'person') persons = b.rows as Array<{ email: string }>;
      if (b.schemaKey === 'mobile') mobiles = b.rows as Array<{ personEmail: string }>;
    }
    expect(mobiles[0]!.personEmail).toBe(persons[0]!.email);
    expect(mobiles[1]!.personEmail).toBe(persons[1]!.email);
  });
});
```

- [ ] **Step 7.6: Run all run-set-stream tests**

```bash
pnpm -F @mirage/engine test -- run-set-stream
```

Expected: PASS — all 3 tests.

- [ ] **Step 7.7: Export from index**

Edit `packages/engine/src/index.ts` — append:

```ts
export * from './run-set-stream.js';
```

- [ ] **Step 7.8: Checkpoint**

```bash
pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine lint && pnpm -F @mirage/engine test
```

Expected: all pass.

---

## Task 8: AbortSignal cancellation

The cancellation gate is already in place at batch boundaries (`signal?.aborted` checks at the top of the schema loop and just before each yield). Add a regression test to lock the behaviour in, plus confirm the partial batch is *not* yielded after abort.

**Files:**
- Modify: `packages/engine/src/__tests__/run-set-stream.test.ts`

- [ ] **Step 8.1: Write failing test**

Append to `packages/engine/src/__tests__/run-set-stream.test.ts`:

```ts
describe('runSetStream — cancellation', () => {
  it('throws CancelledError when signal is aborted between batches', async () => {
    const schemas = [schema('a', [{ name: 'id', type: 'string', faker: 'string.uuid' }])];
    const set = buildSet([{ schemaKey: 'a', count: 10 }]);
    const controller = new AbortController();
    const it = runSetStream({
      set,
      schemas,
      customFunctions: createCustomFunctionRegistry([]),
      sandbox: fakeSandbox,
      batchSize: 3,
      signal: controller.signal,
    })[Symbol.asyncIterator]();
    const first = await it.next();
    expect(first.done).toBe(false);
    controller.abort();
    await expect(it.next()).rejects.toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 8.2: Run the test — passes if Task 7 plumbing is correct**

```bash
pnpm -F @mirage/engine test -- run-set-stream
```

Expected: PASS — all 4 run-set-stream tests. If the cancel test fails (signal not checked), reread `run-set-stream.ts` and verify the abort checks at:
- top of each schema iteration (line near `if (signal?.aborted) throw new CancelledError();`)
- before every yield inside the schema's row loop

- [ ] **Step 8.3: Checkpoint**

```bash
pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine lint && pnpm -F @mirage/engine test
```

Expected: all pass.

---

## Task 9: Remove the legacy `runSet`, update engine exports

The only consumer is `apps/generation-worker/src/processor.ts`. Task 11 migrates the processor; this task deletes `run-set.ts` and clears the export.

**Files:**
- Delete: `packages/engine/src/run-set.ts`
- Modify: `packages/engine/src/index.ts` (remove `./run-set.js` export; keep the `applyStrategy` export from `apply-strategy.ts` — Task 5's custom path still uses it indirectly).
- Modify: `packages/engine/src/apply-strategy.ts` — file is no longer used by `run-set.ts`. It's still re-exported. Leave it as-is for now; the custom strategy resolver replicates the validation logic.

- [ ] **Step 9.1: Delete `run-set.ts`**

Run:

```bash
rm /Users/pathik/Desktop/Github/mirage/packages/engine/src/run-set.ts
```

- [ ] **Step 9.2: Remove the export from index**

Edit `packages/engine/src/index.ts`. Remove the `export * from './run-set.js';` line. Final state should be:

```ts
/**
 * `@mirage/engine` — pure generation core.
 *
 * No I/O. Same inputs always produce the same outputs (modulo the supplied
 * salt). Consumed by the generation worker, the BFF (for cycle validation),
 * and the SPA (for live relationship-graph highlighting).
 */

export * from './errors.js';
export * from './cycle.js';
export * from './custom-function-registry.js';
export * from './resolve-schema.js';
export * from './apply-strategy.js';
export * from './extract-set-edges.js';
export * from './extract-fn-refs.js';
export * from './rng.js';
export * from './faker-engine.js';
export * from './topology.js';
export * from './plan-run-set.js';
export * from './strategy-resolver.js';
export * from './generate-rows.js';
export * from './run-set-stream.js';
```

- [ ] **Step 9.3: Run engine typecheck**

```bash
pnpm -F @mirage/engine typecheck
```

Expected: typecheck PASSES — nothing in the engine package itself imports from `run-set.js`.

- [ ] **Step 9.4: Run worker typecheck — it will fail**

```bash
pnpm -F @mirage/generation-worker typecheck
```

Expected: FAIL — `processor.ts` still imports `runSet` from `@mirage/engine`. This is expected; Task 11 fixes the worker. Note the failure and move on. *Do not "fix" by adding a re-export — that would defeat the migration.*

- [ ] **Step 9.5: Checkpoint (engine only)**

```bash
pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine lint && pnpm -F @mirage/engine test
```

Expected: engine package itself passes.

---

## Task 10: Lower the per-schema count cap from 10 M to 1 M (workspace-svc + engine)

Belt-and-braces:
- workspace-svc rejects Set creation/update with count > 1 M.
- Engine's `planRunSet` throws too (already covered by Task 3 — the constant is `MAX_ROWS_PER_SCHEMA = 1_000_000`).

The workspace-svc currently caps at 10 000 000 (`_setHelpers.ts:84`). Move it to a named constant and re-use.

**Files:**
- Modify: `apps/workspace-svc/src/routes/_setHelpers.ts`

- [ ] **Step 10.1: Update `_setHelpers.ts`**

Edit `apps/workspace-svc/src/routes/_setHelpers.ts`. Add a constant import-or-redefine at the top of the file (after the existing imports):

```ts
import type { Api } from '@mirage/types';
import { extractSetEdges, MAX_ROWS_PER_SCHEMA, type SetEdge } from '@mirage/engine';
```

Then replace the count check on the inclusions loop. Find:

```ts
    if (!Number.isInteger(inc.count) || inc.count < 0 || inc.count > 10_000_000) {
      return err(
        'schema_inclusion_invalid',
        `count for ${inc.schemaKey} must be an integer in [0, 10_000_000]`,
      );
    }
```

Replace with:

```ts
    if (!Number.isInteger(inc.count) || inc.count < 0 || inc.count > MAX_ROWS_PER_SCHEMA) {
      return err(
        'schema_inclusion_invalid',
        `count for ${inc.schemaKey} must be an integer in [0, ${MAX_ROWS_PER_SCHEMA.toLocaleString('en-US')}]`,
      );
    }
```

- [ ] **Step 10.2: Verify the workspace-svc typechecks**

```bash
pnpm -F @mirage/workspace-svc typecheck
```

Expected: PASS.

- [ ] **Step 10.3: Manual smoke notes**

There are no automated tests for `_setHelpers.ts` yet (out of scope for this plan to introduce). Add a TODO line in CHANGELOG/PR description: "After streaming engine merges, the per-schema count cap dropped from 10 M to 1 M; existing Sets above the cap will fail validation only on the next save — they will still run unmodified."

- [ ] **Step 10.4: Checkpoint**

```bash
pnpm -F @mirage/workspace-svc typecheck && pnpm -F @mirage/workspace-svc lint
```

Expected: both pass.

---

## Task 11: Worker migration — consume `runSetStream`

Replace the buffered `runSet` call in `processor.ts` with `planRunSet` + `runSetStream`. Emit `run.progress` per batch. Plumb `AbortSignal` from a cancel-polling loop instead of the existing pre-schema `isCancelled` check.

**Files:**
- Modify: `apps/generation-worker/src/processor.ts`
- Modify: `apps/generation-worker/src/env.ts` (add `GENERATION_BATCH_SIZE`)

- [ ] **Step 11.1: Add `GENERATION_BATCH_SIZE` to env**

Open `apps/generation-worker/src/env.ts` and read the file first.

```bash
cat /Users/pathik/Desktop/Github/mirage/apps/generation-worker/src/env.ts
```

Add (or extend) the env parsing to expose `generationBatchSize: number` (default 500). The shape used elsewhere is `env.s3.bucket` etc., so place it under `env.generation = { batchSize: ... }` or at the top level — match whatever pattern is already there. (If the file structure isn't clear from the read, just append a small block parsing `process.env.GENERATION_BATCH_SIZE` to an integer ≥ 1.)

Example edit (only apply the pattern that fits the existing file layout):

```ts
export const env = {
  // ... existing fields ...
  generation: {
    batchSize: parseIntOr(process.env.GENERATION_BATCH_SIZE, 500),
  },
};

function parseIntOr(v: string | undefined, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
```

If `env.ts` already uses a zod or schema-based parser, follow that pattern instead.

- [ ] **Step 11.2: Rewrite `processor.ts` to consume the stream**

Edit `apps/generation-worker/src/processor.ts`. The new body replaces the old `runSet` path:

```ts
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import { planRunSet, runSetStream, CancelledError } from '@mirage/engine';
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

const CANCEL_POLL_MS = 250;

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
    const cancelController = new AbortController();
    const cancelTimer = setInterval(() => {
      void isCancelled(cancelRedis, runId).then((c) => {
        if (c) cancelController.abort();
      });
    }, CANCEL_POLL_MS);

    try {
      if (await isCancelled(cancelRedis, runId)) throw new CancelledError();

      const { set, schemas, registry } = await loadRunInputs({ db, workspaceId, setId });
      const sandbox = getSandbox();
      const plan = planRunSet({ set, schemas });

      await publish(
        {
          type: 'run.progress',
          runId,
          schemaId: (plan.order[0] ?? '') as SchemaId,
          produced: 0,
          total: plan.totalRows,
          at: nowIso(),
        } satisfies RunProgressEvent,
        orgId,
      );

      writer = new RunArtifactWriter({
        orgId,
        workspaceId,
        runId,
        s3Client: s3,
        bucket: env.s3.bucket,
      });

      const rowCounts: Record<string, number> = {};

      for await (const batch of runSetStream({
        set,
        schemas,
        customFunctions: registry,
        sandbox,
        batchSize: env.generation.batchSize,
        signal: cancelController.signal,
      })) {
        for (const row of batch.rows) {
          await writer.writeRow({ __schemaKey: batch.schemaKey, ...(row as object) });
        }
        rowCounts[batch.schemaKey] = batch.schemaProduced;
        const progress: RunProgressEvent = {
          type: 'run.progress',
          runId,
          schemaId: batch.schemaKey as SchemaId,
          produced: batch.totalProduced,
          total: batch.totalRows,
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
        rowCounts: rowCounts as Partial<Record<SchemaId, number>>,
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
        try {
          await writer.abort();
        } catch (abortErr) {
          log.warn({ err: abortErr }, 'failed to abort upload');
        }
      }
      const message =
        err instanceof LoadFailure
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
    } finally {
      clearInterval(cancelTimer);
    }
  };
}
```

Notes:
- The local `CancelledError` class is gone — we re-export the engine's `CancelledError` from `run-set-stream.ts` and consume that. Verify `CancelledError` is exported from `@mirage/engine` (it is — `run-set-stream.ts` exports it).
- `rowCounts[batch.schemaKey] = batch.schemaProduced` — every batch overwrites with the latest `schemaProduced` so we end up with the per-schema total.
- The cancel timer fires every 250 ms; on abort the engine's batch-boundary check (Task 8) throws `CancelledError`.

- [ ] **Step 11.3: Worker typecheck**

```bash
pnpm -F @mirage/generation-worker typecheck
```

Expected: PASS.

- [ ] **Step 11.4: Worker lint**

```bash
pnpm -F @mirage/generation-worker lint
```

Expected: PASS.

- [ ] **Step 11.5: Checkpoint**

```bash
pnpm -F @mirage/engine typecheck && pnpm -F @mirage/engine lint && pnpm -F @mirage/engine test \
  && pnpm -F @mirage/generation-worker typecheck && pnpm -F @mirage/generation-worker lint \
  && pnpm -F @mirage/workspace-svc typecheck && pnpm -F @mirage/workspace-svc lint
```

Expected: all pass.

---

## Task 12: Final verification — full lint/typecheck + manual smoke

- [ ] **Step 12.1: Full repo typecheck**

```bash
pnpm -F @mirage/types typecheck \
  && pnpm -F @mirage/engine typecheck \
  && pnpm -F @mirage/sandbox typecheck \
  && pnpm -F @mirage/workspace-svc typecheck \
  && pnpm -F @mirage/generation-worker typecheck \
  && pnpm -F @mirage/bff typecheck \
  && pnpm -F @mirage/web typecheck
```

Expected: every package compiles.

- [ ] **Step 12.2: Full lint**

```bash
pnpm lint
```

Expected: zero errors.

- [ ] **Step 12.3: Engine tests**

```bash
pnpm -F @mirage/engine test
```

Expected: all suites green.

- [ ] **Step 12.4: Manual smoke — local dev**

Start the worker + workspace-svc + bff + web from `pnpm dev`. With the seeded `person` / `mobile` / `driving-licence` Set in the dev workspace:

1. Trigger a small Run (counts ~50 each). Confirm `run.progress` events arrive multiple times per schema in the UI (browser devtools → WS frames). Previously you'd see one per schema; now you should see ~`count/500` per schema.
2. Trigger a Run with `count` = 600 to confirm batching crosses 500. Expect at least 2 progress events per schema.
3. Edit a Set to `count: 2_000_000` and save. Expect a 400 with `schema_inclusion_invalid` and the new "in [0, 1,000,000]" message.
4. Start a Run and click "Cancel" mid-flight. Confirm `run.cancelled` arrives and no NDJSON object exists in MinIO/S3.

Document any deltas from this checklist in the PR description (we'll convert to commits per the user's other instruction).

- [ ] **Step 12.5: Final summary message**

After verifying all steps green, post a one-paragraph summary to the user describing:
- Files added: `topology.ts`, `plan-run-set.ts`, `strategy-resolver.ts`, `generate-rows.ts`, `run-set-stream.ts`, `vitest.config.ts`, six test files.
- Files removed: `run-set.ts`.
- Files modified: `index.ts`, `resolve-schema.ts`, `package.json` (engine); `processor.ts`, `env.ts` (worker); `_setHelpers.ts` (workspace-svc).
- New invariants: peak memory bounded; per-batch progress events; 1 M cap.
- Outstanding: no automated worker integration tests (deferred — would need a Redis/Mongo testcontainer setup), only manual smoke.

---

## Self-review checklist

- ☑ Vitest is set up before any test is written (Task 1).
- ☑ Every new module has at least one test (Tasks 2–8).
- ☑ Cancellation is verified at the engine level (Task 8) and plumbed at the worker level (Task 11).
- ☑ Custom strategies fall back to buffered rows; explicit error if registry/sandbox missing (Task 5).
- ☑ Engine throws on count > 1 M (Task 3, planRunSet); BFF echoes the cap (Task 10).
- ☑ `runSet` is fully removed (Task 9) — no shim, no deprecation.
- ☑ All commit steps replaced by checkpoints; no `git commit` invoked anywhere.
- ☑ Engine exports added incrementally so each task's checkpoint is independently green.
