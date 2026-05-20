# Generation Engine + Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `NotImplementedError` stubs in `@mirage/engine` and `@mirage/sandbox` with real implementations: faker-driven row generation against the OpenAPI Schema shape, all four Strategy variants, and a `worker_threads`+`node:vm` sandbox with per-call timeouts, memory caps, and a compiled-function cache. After this slice, `runSet(...)` produces deterministic rows with refs filled in.

**Architecture:** The engine operates on OpenAPI shapes (`SchemaProp[]`, OpenAPI `Strategy` union). A tiny `mulberry32 + hashSeed` PRNG seeds every random choice from the Set's salt. Faker is instantiated per-Schema with a locale-aware factory. Custom Functions execute through the sandbox pool, which sends source once per worker (cached by sha1 hash) and reuses compiled `vm.compileFunction` instances for subsequent calls. `runSet` orchestrates topo-sorted Schema resolution → Strategy resolution → reference substitution.

**Tech Stack:** TypeScript strict ESM, `@faker-js/faker` (new dep on `@mirage/engine`), `node:worker_threads` + `node:vm` (sandbox), `node:crypto` (sourceHash). No browser code in this slice.

**Verification model:** Same as prior slices — no automated tests per [TECH_ARCHITECHRE.md §5](../../TECH_ARCHITECHRE.md). Every task ends with `nx typecheck,lint` on touched projects plus `prettier --check`. Engine + sandbox each get a `tsx` smoke script committed to `packages/*/scripts/`. Do **not** commit per project memory — leave changes uncommitted for review.

**Spec:** [docs/superpowers/specs/2026-05-20-engine-and-sandbox-design.md](../specs/2026-05-20-engine-and-sandbox-design.md).

---

## File map

**Created:**

| Path | Responsibility |
|---|---|
| `packages/engine/src/rng.ts` | `mulberry32` + `hashSeed` deterministic PRNG + seed-derivation helpers |
| `packages/engine/src/faker-engine.ts` | Locale-aware faker factory + faker-method dispatcher |
| `packages/engine/src/run-set.ts` | Orchestrator: cycle check → topo-order → resolveSchema per Schema → applyStrategy per edge → ref substitution |
| `packages/engine/scripts/run-set-smoke.mts` | tsx smoke script — exercises `runSet` against a 2-Schema set, asserts determinism |
| `packages/sandbox/scripts/sandbox-smoke.mts` | tsx smoke script — exercises pool: trivial call, cache hit, timeout, no Node globals |

**Modified:**

| Path | Why |
|---|---|
| `packages/engine/package.json` | Add `@faker-js/faker` + `@mirage/sandbox` deps |
| `packages/engine/src/index.ts` | Re-export new modules |
| `packages/engine/src/custom-function-registry.ts` | Reshape `CustomFunctionEntry` to carry `usage` |
| `packages/engine/src/resolve-schema.ts` | Rewrite to walk OpenAPI `SchemaProp[]` and call sandbox for `$fn:` refs |
| `packages/engine/src/apply-strategy.ts` | Rewrite for OpenAPI `Strategy` union; implement all four variants |
| `packages/sandbox/src/protocol.ts` | Add `sourceHash` field, nullable `source`, `CacheMiss` sentinel |
| `packages/sandbox/src/worker.ts` | Real `vm.compileFunction` + cache + message loop |
| `packages/sandbox/src/pool.ts` | Real `worker_threads` pool with free-list, queue, timeouts, replacement |
| `apps/generation-worker/package.json` | (unchanged — already lists `@mirage/engine` and `@mirage/sandbox`; verify only) |

**Unchanged (intentionally left as documentation):** `packages/types/src/schema.ts`, `packages/types/src/set.ts` abstract types; `packages/engine/src/cycle.ts` (the OpenAPI cycle check is rebuilt inline in `runSet`).

---

## Task 1: Update sandbox protocol with sourceHash + cache-miss sentinel

**Files:**
- Modify: `packages/sandbox/src/protocol.ts`

- [ ] **Step 1: Replace the file contents**

```ts
/**
 * Wire protocol between the sandbox pool (main thread) and a sandbox worker
 * (`worker_threads`). Both sides agree on these message shapes; nothing else
 * crosses the boundary.
 */

export interface SandboxInvokeMessage {
  type: 'invoke';
  /** Caller-chosen id for matching responses to requests. */
  callId: string;
  /** sha1(source).slice(0, 12) — used as the cache key inside the worker. */
  sourceHash: string;
  /**
   * The function source. Null when the pool believes the worker already has
   * `sourceHash` cached; the worker responds with a `CacheMiss` error if it
   * doesn't, prompting the pool to resend with `source` populated.
   */
  source: string | null;
  /** Argument object passed to the function. Must be structured-cloneable. */
  args: unknown;
  /** Per-call wall-clock limit (ms). The worker passes this to `vm`'s `timeout` option. */
  timeoutMs: number;
}

export interface SandboxResultMessage {
  type: 'result';
  callId: string;
  ok: true;
  value: unknown;
}

export interface SandboxErrorMessage {
  type: 'result';
  callId: string;
  ok: false;
  /**
   * Class name from the worker (e.g. `TimeoutError`, `SyntaxError`, `TypeError`).
   * The sentinel `'CacheMiss'` indicates the worker needs the source resent.
   */
  errorName: string;
  errorMessage: string;
  /** Stripped of file paths to avoid leaking worker internals. */
  stack?: string;
}

export type SandboxMessageToWorker = SandboxInvokeMessage;
export type SandboxMessageFromWorker = SandboxResultMessage | SandboxErrorMessage;
```

- [ ] **Step 2: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/sandbox --skip-nx-cache
pnpm exec prettier --check packages/sandbox
```

Expected: green.

---

## Task 2: Real worker — `vm.compileFunction` + cache + message loop

**Files:**
- Modify: `packages/sandbox/src/worker.ts`

- [ ] **Step 1: Replace the file contents**

```ts
/**
 * Sandbox worker entry — runs inside a `worker_threads` Worker.
 *
 * Security model (TECH_ARCHITECHRE.md §3.4):
 * - Each call's user source is compiled with `vm.compileFunction` inside a
 *   shared `vm.Context` built once per worker.
 * - The context is `vm.createContext({})` so it has *no* Node globals —
 *   `require`, `process`, `Buffer`, `fs`, `module`, `__dirname` are absent.
 * - `vm`'s `timeout` option enforces the per-call wall-clock limit. Worker
 *   `resourceLimits.maxOldGenerationSizeMb` caps memory.
 * - A compiled-function cache keyed by `sourceHash` amortises parse cost across
 *   many calls (e.g. a Value Generator called once per row).
 */

import { parentPort } from 'node:worker_threads';
import vm from 'node:vm';
import type { SandboxMessageFromWorker, SandboxMessageToWorker } from './protocol.js';

if (!parentPort) {
  throw new Error('sandbox worker started outside a worker_threads context');
}

const ctx = vm.createContext({});
const cache = new Map<string, (args: unknown) => unknown>();

function handle(msg: SandboxMessageToWorker): SandboxMessageFromWorker {
  if (msg.type !== 'invoke') {
    return {
      type: 'result',
      callId: 'unknown',
      ok: false,
      errorName: 'Error',
      errorMessage: `unknown message type: ${(msg as { type: string }).type}`,
    };
  }
  const { callId, sourceHash, source, args, timeoutMs } = msg;
  try {
    let fn = cache.get(sourceHash);
    if (!fn) {
      if (source === null) {
        return {
          type: 'result',
          callId,
          ok: false,
          errorName: 'CacheMiss',
          errorMessage: 'sourceHash not cached',
        };
      }
      fn = vm.compileFunction(source, ['ctx'], {
        parsingContext: ctx,
        // `timeout` on compileFunction applies to compilation; invocation
        // re-uses the wall-clock budget through vm.runInContext below.
      }) as (args: unknown) => unknown;
      cache.set(sourceHash, fn);
    }
    // Invocation timeout: wrap the call in vm.runInContext so we can pass
    // `timeout`. The compiled function is in the same context, so we expose
    // it via a one-shot global.
    (ctx as unknown as { __mirage_fn?: typeof fn }).__mirage_fn = fn;
    (ctx as unknown as { __mirage_args?: unknown }).__mirage_args = args;
    try {
      const value = vm.runInContext('__mirage_fn(__mirage_args)', ctx, { timeout: timeoutMs });
      return { type: 'result', callId, ok: true, value };
    } finally {
      delete (ctx as unknown as { __mirage_fn?: typeof fn }).__mirage_fn;
      delete (ctx as unknown as { __mirage_args?: unknown }).__mirage_args;
    }
  } catch (e) {
    const name = e instanceof Error ? e.name : 'Error';
    return {
      type: 'result',
      callId,
      ok: false,
      errorName: name === 'Error' && /timed out/i.test(String(e)) ? 'TimeoutError' : name,
      errorMessage: e instanceof Error ? e.message : String(e),
      stack:
        e instanceof Error && typeof e.stack === 'string'
          ? e.stack.split('\n').slice(0, 6).join('\n')
          : undefined,
    };
  }
}

parentPort.on('message', (msg: SandboxMessageToWorker) => {
  const reply = handle(msg);
  parentPort!.postMessage(reply);
});

// Surface unhandled errors as a fatal exit so the pool can recycle the worker.
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('sandbox worker uncaughtException:', err);
  process.exit(1);
});

export type WorkerHandler = typeof handle;
```

- [ ] **Step 2: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/sandbox --skip-nx-cache
pnpm exec prettier --check packages/sandbox
```

Expected: green.

---

## Task 3: Real pool — `worker_threads` lifecycle + IPC + queue

**Files:**
- Modify: `packages/sandbox/src/pool.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type {
  SandboxInvokeOptions,
  SandboxPool,
  SandboxPoolOptions,
} from './types.js';
import {
  SandboxCompileError,
  SandboxRuntimeError,
  SandboxTimeoutError,
} from './types.js';
import type {
  SandboxInvokeMessage,
  SandboxMessageFromWorker,
} from './protocol.js';

interface WorkerSlot {
  index: number;
  worker: Worker;
  busy: boolean;
  /** Hashes the worker has acknowledged via a non-CacheMiss reply. */
  cached: Set<string>;
}

interface PendingCall {
  callId: string;
  slot: WorkerSlot;
  source: string;
  sourceHash: string;
  args: unknown;
  timeoutMs: number;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  /** True if this attempt sent source: null (cache hit assumption). */
  triedCached: boolean;
}

interface QueuedCall {
  source: string;
  sourceHash: string;
  args: unknown;
  timeoutMs: number;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

function sha12(source: string): string {
  return crypto.createHash('sha1').update(source).digest('hex').slice(0, 12);
}

function spawnWorker(index: number, memoryCapMb: number): Worker {
  const url = new URL('./worker.js', import.meta.url);
  return new Worker(url, {
    resourceLimits: { maxOldGenerationSizeMb: memoryCapMb },
  });
}

export function createSandboxPool(options: SandboxPoolOptions): SandboxPool {
  if (options.size < 1 || !Number.isInteger(options.size)) {
    throw new RangeError('SandboxPool size must be a positive integer');
  }
  if (options.perCallTimeoutMs <= 0) {
    throw new RangeError('SandboxPool perCallTimeoutMs must be positive');
  }
  if (options.memoryCapMb <= 0) {
    throw new RangeError('SandboxPool memoryCapMb must be positive');
  }

  let shuttingDown = false;
  const slots: WorkerSlot[] = [];
  const queue: QueuedCall[] = [];
  const pending = new Map<string, PendingCall>();

  const attach = (slot: WorkerSlot): void => {
    slot.worker.on('message', (msg: SandboxMessageFromWorker) => {
      const call = pending.get(msg.callId);
      if (!call) return;

      if (msg.ok === false && msg.errorName === 'CacheMiss' && !call.triedCached) {
        // Should not happen — pool only sends source:null when it believes
        // the worker has it. Treat defensively: resend with source.
        slot.cached.delete(call.sourceHash);
        const retry: SandboxInvokeMessage = {
          type: 'invoke',
          callId: call.callId,
          sourceHash: call.sourceHash,
          source: call.source,
          args: call.args,
          timeoutMs: call.timeoutMs,
        };
        call.triedCached = true;
        slot.worker.postMessage(retry);
        return;
      }

      clearTimeout(call.timer);
      pending.delete(msg.callId);
      slot.busy = false;
      if (msg.ok === false && msg.errorName === 'CacheMiss') {
        // Both cached and non-cached attempts failed — surface as runtime err.
        call.reject(new SandboxRuntimeError('worker cache cleared mid-call'));
      } else if (msg.ok === true) {
        // Worker has now compiled and cached the source.
        slot.cached.add(call.sourceHash);
        call.resolve(msg.value);
      } else if (msg.errorName === 'TimeoutError') {
        call.reject(new SandboxTimeoutError(msg.errorMessage));
      } else if (msg.errorName === 'SyntaxError') {
        call.reject(new SandboxCompileError(msg.errorMessage));
      } else {
        const err = new SandboxRuntimeError(`${msg.errorName}: ${msg.errorMessage}`);
        if (msg.stack) err.stack = msg.stack;
        call.reject(err);
      }
      drain();
    });
    slot.worker.on('exit', (code) => {
      if (code === 0) return;
      // Reject any in-flight call on this slot, spawn a replacement.
      for (const [callId, call] of pending) {
        if (call.slot === slot) {
          clearTimeout(call.timer);
          pending.delete(callId);
          call.reject(new SandboxRuntimeError(`worker exited with code ${code}`));
        }
      }
      if (shuttingDown) return;
      slot.worker = spawnWorker(slot.index, options.memoryCapMb);
      slot.cached = new Set();
      slot.busy = false;
      attach(slot);
      drain();
    });
  };

  for (let i = 0; i < options.size; i++) {
    const slot: WorkerSlot = {
      index: i,
      worker: spawnWorker(i, options.memoryCapMb),
      busy: false,
      cached: new Set(),
    };
    slots.push(slot);
    attach(slot);
  }

  const drain = (): void => {
    while (queue.length > 0) {
      const free = slots.find((s) => !s.busy);
      if (!free) return;
      const q = queue.shift()!;
      dispatch(free, q);
    }
  };

  const dispatch = (slot: WorkerSlot, q: QueuedCall): void => {
    const callId = crypto.randomBytes(8).toString('hex');
    const triedCached = slot.cached.has(q.sourceHash);
    const msg: SandboxInvokeMessage = {
      type: 'invoke',
      callId,
      sourceHash: q.sourceHash,
      source: triedCached ? null : q.source,
      args: q.args,
      timeoutMs: q.timeoutMs,
    };
    const timer = setTimeout(() => {
      const call = pending.get(callId);
      if (!call) return;
      pending.delete(callId);
      call.reject(new SandboxTimeoutError(`call ${callId} timed out after ${q.timeoutMs}ms`));
      // Force-recycle the worker; its current call may still be running.
      slot.worker.terminate().catch(() => undefined);
    }, q.timeoutMs + 500);

    pending.set(callId, {
      callId,
      slot,
      source: q.source,
      sourceHash: q.sourceHash,
      args: q.args,
      timeoutMs: q.timeoutMs,
      resolve: q.resolve,
      reject: q.reject,
      timer,
      triedCached,
    });
    slot.busy = true;
    slot.worker.postMessage(msg);
  };

  return {
    async invoke(source: string, args: unknown, opts?: SandboxInvokeOptions): Promise<unknown> {
      if (shuttingDown) {
        throw new Error('SandboxPool is shutting down');
      }
      const timeoutMs = opts?.timeoutMs ?? options.perCallTimeoutMs;
      const sourceHash = sha12(source);
      return new Promise<unknown>((resolve, reject) => {
        const q: QueuedCall = { source, sourceHash, args, timeoutMs, resolve, reject };
        const free = slots.find((s) => !s.busy);
        if (free) dispatch(free, q);
        else queue.push(q);
      });
    },
    async shutdown(): Promise<void> {
      if (shuttingDown) return;
      shuttingDown = true;
      // Grace: 5s for in-flight calls.
      const deadline = Date.now() + 5000;
      while (pending.size > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      await Promise.all(slots.map((s) => s.worker.terminate().catch(() => undefined)));
    },
  };
}
```

- [ ] **Step 2: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/sandbox --skip-nx-cache
pnpm exec prettier --write packages/sandbox/src/pool.ts
pnpm exec prettier --check packages/sandbox
```

Expected: green.

---

## Task 4: Sandbox smoke script

**Files:**
- Create: `packages/sandbox/scripts/sandbox-smoke.mts`

- [ ] **Step 1: Create the smoke script**

```ts
/**
 * Manual sandbox smoke. Run via:
 *   pnpm --filter @mirage/sandbox exec tsx scripts/sandbox-smoke.mts
 *
 * Checks: trivial call, cache hit (logged), timeout, no Node globals,
 * compile error surface.
 */
import { createSandboxPool } from '../src/pool.ts';
import {
  SandboxCompileError,
  SandboxRuntimeError,
  SandboxTimeoutError,
} from '../src/types.ts';

const pool = createSandboxPool({
  size: 1,
  perCallTimeoutMs: 500,
  memoryCapMb: 64,
});

async function run() {
  let passed = 0;
  let failed = 0;
  const assert = (label: string, ok: boolean, detail?: unknown): void => {
    if (ok) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failed++;
      console.log(`  ✗ ${label}`, detail ?? '');
    }
  };

  // 1. trivial call
  const r1 = await pool.invoke('return ctx.a + ctx.b;', { a: 1, b: 2 });
  assert('trivial call returns 3', r1 === 3, r1);

  // 2. cache hit (same source, different args)
  const r2 = await pool.invoke('return ctx.a + ctx.b;', { a: 10, b: 20 });
  assert('cache hit returns 30', r2 === 30, r2);

  // 3. timeout
  try {
    await pool.invoke('while (true) {}', {}, { timeoutMs: 100 });
    assert('infinite loop should time out', false);
  } catch (e) {
    assert('infinite loop times out', e instanceof SandboxTimeoutError, e);
  }

  // 4. no Node globals
  try {
    await pool.invoke('return typeof process;', {});
    // typeof never throws — should return 'undefined'.
    const v = await pool.invoke('return typeof process;', {});
    assert('process is undefined inside sandbox', v === 'undefined', v);
  } catch (e) {
    assert('process check did not throw', false, e);
  }

  try {
    await pool.invoke('return require("fs");', {});
    assert('require should throw', false);
  } catch (e) {
    assert(
      'require is not defined',
      e instanceof SandboxRuntimeError && /require is not defined/i.test(e.message),
      e,
    );
  }

  // 5. compile error
  try {
    await pool.invoke('return ((;', {});
    assert('bad syntax should throw', false);
  } catch (e) {
    assert('bad syntax surfaces as compile error', e instanceof SandboxCompileError, e);
  }

  await pool.shutdown();
  console.log(`\nresult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Verify with the smoke script**

```bash
pnpm --filter @mirage/sandbox exec tsx scripts/sandbox-smoke.mts
```

Expected: all assertions green, exit 0.

If `require is not defined` doesn't surface (instead get `Cannot find module` or similar), it means the worker context has Node bindings leaking — re-check `vm.createContext({})` is being called.

- [ ] **Step 3: Verify typecheck/lint**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/sandbox --skip-nx-cache
pnpm exec prettier --check packages/sandbox
```

Expected: green.

---

## Task 5: Add engine dependencies (faker + sandbox)

**Files:**
- Modify: `packages/engine/package.json`

- [ ] **Step 1: Add deps**

Edit `packages/engine/package.json`. Update the `dependencies` block:

```json
  "dependencies": {
    "@faker-js/faker": "^9.3.0",
    "@mirage/sandbox": "workspace:*",
    "@mirage/types": "workspace:*"
  },
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: pnpm resolves `@faker-js/faker` from the registry and links `@mirage/sandbox` from the workspace. No errors.

- [ ] **Step 3: Verify typecheck still passes**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/engine --skip-nx-cache
```

Expected: green (no usages yet — just the package wired).

---

## Task 6: RNG + seed helpers

**Files:**
- Create: `packages/engine/src/rng.ts`

- [ ] **Step 1: Create the file**

```ts
/**
 * Deterministic PRNG + seed-derivation helpers. Used by the engine for all
 * random choices so identical `Set + salt` produces identical rows.
 */

/** mulberry32 — 32-bit state, returns [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a 32-bit hash of an arbitrary list of strings, separated by the unit
 * separator character so distinct part lists never collide trivially.
 */
export function hashSeed(...parts: string[]): number {
  let h = 0x811c9dc5;
  const SEP = 0x1f;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (i > 0) h = Math.imul(h ^ SEP, 16777619);
    for (let j = 0; j < p.length; j++) {
      h = Math.imul(h ^ p.charCodeAt(j), 16777619);
    }
  }
  return h >>> 0;
}
```

- [ ] **Step 2: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/engine --skip-nx-cache
pnpm exec prettier --check packages/engine
```

Expected: green.

---

## Task 7: Faker engine — locale + method dispatcher

**Files:**
- Create: `packages/engine/src/faker-engine.ts`

- [ ] **Step 1: Create the file**

```ts
import { Faker, allLocales, type LocaleDefinition } from '@faker-js/faker';

/**
 * A small wrapper around a `@faker-js/faker` instance with the seeding and
 * dispatching helpers the row resolver needs.
 *
 * `localeHonored` is `false` when `locale` was not in faker's catalog and we
 * fell back to `en`. Callers may surface this as a warning.
 */
export interface FakerEngine {
  /** Reseed faker before generating rows for a Schema. */
  seed(n: number): void;
  /** Invoke `faker.<ns>.<method>()` by dotted-path. */
  call(method: string): unknown;
  /** Exposed for Custom Functions' `ctx.faker`. */
  faker: Faker;
  /** Whether the requested locale was honored (vs. fallback to en). */
  localeHonored: boolean;
}

const LOCALES: Record<string, LocaleDefinition> = allLocales as Record<
  string,
  LocaleDefinition
>;

export class EngineError extends Error {
  override readonly name = 'EngineError';
  readonly code: string;
  readonly detail: unknown;
  constructor(code: string, detail?: unknown) {
    super(`${code}: ${JSON.stringify(detail ?? null)}`);
    this.code = code;
    this.detail = detail;
  }
}

export function createFakerEngine(locale: string): FakerEngine {
  const requested = LOCALES[locale];
  const fallback = LOCALES['en']!;
  const localeStack = requested ? [requested, fallback] : [fallback];
  const faker = new Faker({ locale: localeStack });

  return {
    seed(n: number): void {
      faker.seed(n);
    },
    call(method: string): unknown {
      const segments = method.split('.');
      if (segments.length < 2) {
        throw new EngineError('unknown_faker_method', { method });
      }
      let cursor: unknown = faker;
      for (let i = 0; i < segments.length - 1; i++) {
        const next = (cursor as Record<string, unknown>)[segments[i]!];
        if (next === undefined || next === null) {
          throw new EngineError('unknown_faker_method', { method });
        }
        cursor = next;
      }
      const tail = segments[segments.length - 1]!;
      const fn = (cursor as Record<string, unknown>)[tail];
      if (typeof fn !== 'function') {
        throw new EngineError('unknown_faker_method', { method });
      }
      try {
        return (fn as () => unknown).call(cursor);
      } catch (e) {
        throw new EngineError('faker_call_failed', {
          method,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
    faker,
    localeHonored: Boolean(requested),
  };
}
```

- [ ] **Step 2: Re-export from engine index**

Add to `packages/engine/src/index.ts`:

```ts
export * from './rng.js';
export * from './faker-engine.js';
```

- [ ] **Step 3: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/engine --skip-nx-cache
pnpm exec prettier --check packages/engine
```

Expected: green.

---

## Task 8: Reshape CustomFunctionRegistry to carry `usage`

**Files:**
- Modify: `packages/engine/src/custom-function-registry.ts`

- [ ] **Step 1: Replace the file contents**

```ts
/**
 * The engine is pure: it does not load Custom Function source from Mongo
 * itself. Whoever calls into the engine (the generation worker today, the
 * SPA's live-preview path tomorrow) supplies a registry mapping ids to source +
 * usage metadata. The engine then hands the source off to `@mirage/sandbox`
 * for execution and asserts the call site's required usage.
 */
export interface CustomFunctionEntry {
  source: string;
  usage: 'valueGenerator' | 'strategy' | 'both';
}

export interface CustomFunctionRegistry {
  get(id: string): CustomFunctionEntry | undefined;
}

/** Convenience constructor for tests and previews — wraps a plain Map. */
export const customFunctionRegistryFromMap = (
  map: ReadonlyMap<string, CustomFunctionEntry>,
): CustomFunctionRegistry => ({
  get: (id) => map.get(id),
});
```

- [ ] **Step 2: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/engine --skip-nx-cache
pnpm exec prettier --check packages/engine
```

Expected: green (no other code uses the old shape yet — the stubs were the only consumers).

---

## Task 9: Real `resolveSchema` — OpenAPI walk + faker + $fn invocation

**Files:**
- Modify: `packages/engine/src/resolve-schema.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { EngineError } from './faker-engine.js';
import { createFakerEngine } from './faker-engine.js';
import { hashSeed, mulberry32 } from './rng.js';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

/** A reference placeholder embedded into a row by resolveSchema; runSet replaces it. */
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

const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;
const FN_RE = /^\$fn:(cfn_[A-Za-z0-9_-]{16})$/;

/** Length of inline arrays when the SchemaProp has no count knob (v1 constant). */
const DEFAULT_ARRAY_LENGTH = 3;

export async function resolveSchema(params: ResolveSchemaParams): Promise<ResolvedRow[]> {
  const { schema, count, salt, locale, customFunctions, sandbox } = params;
  if (!Number.isInteger(count) || count < 0) {
    throw new EngineError('resolve_schema_bad_count', { count });
  }

  const fakerEngine = createFakerEngine(locale);
  fakerEngine.seed(hashSeed(salt, schema.key));

  const out: ResolvedRow[] = [];
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
        customFunctions,
        sandbox,
        fieldPath: p.name,
      });
    }
    out.push({ __schemaKey: schema.key, __id: rowId, ...fields });
  }
  return out;
}

interface ResolvePropContext {
  schemaKey: string;
  fakerEngine: ReturnType<typeof createFakerEngine>;
  rowRng: () => number;
  salt: string;
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

  // Primitive type — resolve via the `faker` string.
  if (typeof p.faker !== 'string' || p.faker.length === 0) {
    return null;
  }

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
    const callerCtx = {
      faker: ctx.fakerEngine.faker,
      rng: ctx.rowRng,
      salt: ctx.salt,
    };
    return ctx.sandbox.invoke(entry.source, callerCtx);
  }

  return ctx.fakerEngine.call(p.faker);
}
```

- [ ] **Step 2: Re-export `isRefPlaceholder` from the index**

Update `packages/engine/src/index.ts` to include the new exports — the wildcard re-export of `./resolve-schema.js` already covers them.

Confirm:

```bash
grep -n "resolve-schema" packages/engine/src/index.ts
```

Expected: existing `export * from './resolve-schema.js';` line (unchanged).

- [ ] **Step 3: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/engine --skip-nx-cache
pnpm exec prettier --write packages/engine/src/resolve-schema.ts
pnpm exec prettier --check packages/engine
```

Expected: green.

---

## Task 10: Real `applyStrategy` — all four variants on OpenAPI Strategy

**Files:**
- Modify: `packages/engine/src/apply-strategy.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { EngineError } from './faker-engine.js';
import { hashSeed, mulberry32 } from './rng.js';
import type { ResolvedRow } from './resolve-schema.js';

type Strategy = Api.components['schemas']['Strategy'];

export interface ApplyStrategyParams {
  strategy: Strategy;
  sourceRows: ReadonlyArray<ResolvedRow>;
  targetRows: ReadonlyArray<ResolvedRow>;
  cardinality: 'one' | 'many';
  many?: { min: number; max: number };
  salt: string;
  fromSchemaKey: string;
  fromFieldPath: string;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

export async function applyStrategy(
  params: ApplyStrategyParams,
): Promise<string[] | string[][]> {
  const {
    strategy,
    sourceRows,
    targetRows,
    cardinality,
    many,
    salt,
    fromSchemaKey,
    fromFieldPath,
    customFunctions,
    sandbox,
  } = params;
  const rng = mulberry32(hashSeed(salt, fromSchemaKey, fromFieldPath));

  if (strategy.type === '1:1') {
    if (cardinality !== 'one') {
      throw new EngineError('strategy_11_cardinality', {
        fromSchemaKey,
        fromFieldPath,
        cardinality,
      });
    }
    if (sourceRows.length !== targetRows.length) {
      throw new EngineError('strategy_11_count_mismatch', {
        fromSchemaKey,
        fromFieldPath,
        source: sourceRows.length,
        target: targetRows.length,
      });
    }
    return sourceRows.map((_, i) => targetRows[i]!.__id);
  }

  if (strategy.type === 'evenSplit') {
    if (targetRows.length === 0) {
      throw new EngineError('strategy_no_targets', { fromSchemaKey, fromFieldPath });
    }
    if (cardinality === 'one') {
      return sourceRows.map((_, i) => targetRows[i % targetRows.length]!.__id);
    }
    const range = many ?? { min: 1, max: 1 };
    return sourceRows.map((_, i) => {
      const k = clampInt(
        Math.round(targetRows.length / Math.max(1, sourceRows.length)),
        range.min,
        range.max,
      );
      const out: string[] = [];
      for (let j = 0; j < k; j++) {
        const idx = (i * k + j) % targetRows.length;
        out.push(targetRows[idx]!.__id);
      }
      return out;
    });
  }

  if (strategy.type === 'random') {
    if (targetRows.length === 0) {
      throw new EngineError('strategy_no_targets', { fromSchemaKey, fromFieldPath });
    }
    if (cardinality === 'one') {
      return sourceRows.map(() => {
        const idx = Math.floor(rng() * targetRows.length);
        return targetRows[idx]!.__id;
      });
    }
    const range = many ?? { min: 1, max: 1 };
    const allowDuplicates = (strategy as { allowDuplicates?: boolean }).allowDuplicates !== false;
    return sourceRows.map(() => {
      const k = clampInt(range.min + Math.floor(rng() * (range.max - range.min + 1)), 0, targetRows.length);
      if (k === 0) return [];
      if (allowDuplicates) {
        const out: string[] = [];
        for (let j = 0; j < k; j++) {
          out.push(targetRows[Math.floor(rng() * targetRows.length)]!.__id);
        }
        return out;
      }
      const pool: string[] = targetRows.map((r) => r.__id);
      const picks: string[] = [];
      const limit = Math.min(k, pool.length);
      for (let j = 0; j < limit; j++) {
        const swapIdx = j + Math.floor(rng() * (pool.length - j));
        const tmp = pool[j]!;
        pool[j] = pool[swapIdx]!;
        pool[swapIdx] = tmp;
        picks.push(pool[j]!);
      }
      return picks;
    });
  }

  if (strategy.type === 'custom') {
    const functionId = (strategy as { functionId?: string }).functionId;
    if (typeof functionId !== 'string' || functionId.length === 0) {
      throw new EngineError('strategy_custom_missing_fn', { fromSchemaKey, fromFieldPath });
    }
    const entry = customFunctions.get(functionId);
    if (!entry) {
      throw new EngineError('fn_target_missing', { fromSchemaKey, fromFieldPath, functionId });
    }
    if (entry.usage === 'valueGenerator') {
      throw new EngineError('fn_usage_mismatch', {
        fromSchemaKey,
        fromFieldPath,
        functionId,
        usage: entry.usage,
      });
    }
    const ctx = {
      sourceRows,
      targetRows,
      cardinality,
      rng,
      salt,
    };
    const result = await sandbox.invoke(entry.source, ctx);
    if (!validateStrategyResult(result, cardinality, sourceRows.length)) {
      throw new EngineError('strategy_custom_bad_shape', {
        fromSchemaKey,
        fromFieldPath,
        functionId,
        cardinality,
      });
    }
    return result as string[] | string[][];
  }

  throw new EngineError('strategy_unknown', { fromSchemaKey, fromFieldPath, strategy });
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function validateStrategyResult(
  result: unknown,
  cardinality: 'one' | 'many',
  expectedLength: number,
): boolean {
  if (!Array.isArray(result) || result.length !== expectedLength) return false;
  if (cardinality === 'one') {
    return result.every((x) => typeof x === 'string');
  }
  return result.every(
    (x) => Array.isArray(x) && (x as unknown[]).every((y) => typeof y === 'string'),
  );
}
```

- [ ] **Step 2: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/engine --skip-nx-cache
pnpm exec prettier --write packages/engine/src/apply-strategy.ts
pnpm exec prettier --check packages/engine
```

Expected: green.

---

## Task 11: `runSet` orchestrator

**Files:**
- Create: `packages/engine/src/run-set.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Create `run-set.ts`**

```ts
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { applyStrategy } from './apply-strategy.js';
import { extractSetEdges, type SetEdge } from './extract-set-edges.js';
import { EngineError } from './faker-engine.js';
import {
  isRefPlaceholder,
  resolveSchema,
  type RefPlaceholder,
  type ResolvedRow,
} from './resolve-schema.js';

type MirageSet = Api.components['schemas']['Set'];
type Schema = Api.components['schemas']['Schema'];
type Strategy = Api.components['schemas']['Strategy'];

export interface RunSetParams {
  set: MirageSet;
  schemas: ReadonlyArray<Schema>;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

export interface RunSetResult {
  rowsByKey: Map<string, ResolvedRow[]>;
  edges: ReadonlyArray<SetEdge>;
}

export async function runSet(params: RunSetParams): Promise<RunSetResult> {
  const { set, schemas, customFunctions, sandbox } = params;

  const includedKeys = new Set(set.schemas.map((s) => s.schemaKey));
  for (const inc of set.schemas) {
    if (!schemas.some((s) => s.key === inc.schemaKey)) {
      throw new EngineError('schema_missing', { schemaKey: inc.schemaKey });
    }
  }

  const edges = extractSetEdges(schemas, includedKeys);

  // Cycle check over the schemaKey graph derived from edges.
  const cycles = detectCycles(includedKeys, edges);
  if (cycles.length > 0) {
    throw new EngineError('cycle_in_set', { cycles });
  }

  // Topo order: schemas not depended on come first.
  const order = topoSort(includedKeys, edges);

  // Resolve rows per schema in topo order.
  const rowsByKey = new Map<string, ResolvedRow[]>();
  for (const schemaKey of order) {
    const inc = set.schemas.find((s) => s.schemaKey === schemaKey)!;
    const schema = schemas.find((s) => s.key === schemaKey)!;
    const rows = await resolveSchema({
      schema,
      count: inc.count,
      salt: set.salt,
      locale: set.output.locale,
      customFunctions,
      sandbox,
    });
    rowsByKey.set(schemaKey, rows);
  }

  // For each edge, apply strategy and substitute placeholders.
  for (const edge of edges) {
    const sourceRows = rowsByKey.get(edge.fromSchemaKey);
    const targetRows = rowsByKey.get(edge.toSchemaKey);
    if (!sourceRows || !targetRows) continue;

    const override = set.strategies.find(
      (o) => o.schemaKey === edge.fromSchemaKey && o.fieldPath === edge.fromFieldPath,
    );
    const strategy: Strategy = override?.strategy ?? { type: '1:1' };
    const cardinality = edge.cardinality;
    const many = cardinality === 'many' ? { min: 1, max: 3 } : undefined;

    const ids = await applyStrategy({
      strategy,
      sourceRows,
      targetRows,
      cardinality,
      ...(many ? { many } : {}),
      salt: set.salt,
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
      customFunctions,
      sandbox,
    });

    for (let i = 0; i < sourceRows.length; i++) {
      const row = sourceRows[i]!;
      substituteRef(row as Record<string, unknown>, edge.fromFieldPath, ids[i]!);
    }
  }

  return { rowsByKey, edges };
}

function detectCycles(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): Array<{ schemaKeys: string[]; fieldPaths: string[] }> {
  const adj = new Map<string, Array<{ to: string; fieldPath: string }>>();
  for (const k of schemaKeys) adj.set(k, []);
  for (const e of edges) {
    adj.get(e.fromSchemaKey)?.push({ to: e.toSchemaKey, fieldPath: e.fromFieldPath });
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const colour = new Map<string, number>();
  for (const k of schemaKeys) colour.set(k, WHITE);

  const cycles: Array<{ schemaKeys: string[]; fieldPaths: string[] }> = [];
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
          fieldPaths: [
            ...cyclePath.slice(1).map((f) => f.incomingField),
            e.fieldPath,
          ],
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

function topoSort(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): string[] {
  // Edge from A → B means A references B. Resolve B before A.
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
    // Shouldn't happen — detectCycles ran first. Defensive only.
    return [...schemaKeys];
  }
  return out;
}

function substituteRef(
  row: Record<string, unknown>,
  fieldPath: string,
  replacement: string | string[],
): void {
  // Walk the dotted path (with `[]` array separators) and replace
  // RefPlaceholder objects encountered at the leaves.
  const parts = parsePath(fieldPath);
  walkAndReplace(row, parts, 0, replacement);
}

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

function walkAndReplace(
  node: unknown,
  segs: PathSegment[],
  idx: number,
  replacement: string | string[],
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

export type { RefPlaceholder };
```

- [ ] **Step 2: Re-export from index**

Add to `packages/engine/src/index.ts`:

```ts
export * from './run-set.js';
```

- [ ] **Step 3: Verify**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/engine --skip-nx-cache
pnpm exec prettier --write packages/engine/src/run-set.ts packages/engine/src/index.ts
pnpm exec prettier --check packages/engine
```

Expected: green.

---

## Task 12: Engine smoke script — runSet against a 2-Schema set

**Files:**
- Create: `packages/engine/scripts/run-set-smoke.mts`

- [ ] **Step 1: Create the script**

```ts
/**
 * Manual engine smoke. Run via:
 *   pnpm --filter @mirage/engine exec tsx scripts/run-set-smoke.mts
 *
 * Builds an in-memory two-Schema Set with a $ref edge plus a $fn-driven
 * Value Generator, then calls runSet twice and asserts the outputs are
 * deep-equal (determinism).
 */
import { createSandboxPool } from '@mirage/sandbox';
import {
  customFunctionRegistryFromMap,
  isRefPlaceholder,
  runSet,
} from '../src/index.ts';

type Schema = import('@mirage/types').Api.components['schemas']['Schema'];
type MirageSet = import('@mirage/types').Api.components['schemas']['Set'];

const schemas: Schema[] = [
  {
    id: 'sch_person',
    workspaceId: 'ws_x',
    orgId: 'acme',
    key: 'person',
    name: 'Person',
    description: '',
    color: 'cyan',
    icon: 'user',
    tags: [],
    properties: [
      { name: 'id', type: 'string', required: true, faker: 'string.uuid' },
      { name: 'firstName', type: 'string', required: true, faker: 'person.firstName' },
      // Value Generator via custom function — exercises the sandbox.
      { name: 'tag', type: 'string', required: true, faker: '$fn:cfn_aaaaaaaaaaaaaaaa' },
    ],
    createdBy: 'dev',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sch_mobile',
    workspaceId: 'ws_x',
    orgId: 'acme',
    key: 'mobile',
    name: 'Mobile',
    description: '',
    color: 'violet',
    icon: 'phone',
    tags: [],
    properties: [
      { name: 'id', type: 'string', required: true, faker: 'string.uuid' },
      { name: 'personId', type: 'string', required: true, faker: '$ref:person.id' },
    ],
    createdBy: 'dev',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const set: MirageSet = {
  id: 'set_smoke',
  workspaceId: 'ws_x',
  orgId: 'acme',
  key: 'smoke',
  name: 'Smoke',
  description: '',
  color: 'emerald',
  icon: 'box',
  tags: [],
  salt: 'engine-smoke-001',
  schemas: [
    { schemaKey: 'person', count: 5 },
    { schemaKey: 'mobile', count: 8 },
  ],
  strategies: [
    {
      schemaKey: 'mobile',
      fieldPath: 'personId',
      strategy: { type: 'random' },
    },
  ],
  output: { format: 'json', locale: 'en_US', workerPool: 1 },
  createdBy: 'dev',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const customFunctions = customFunctionRegistryFromMap(
  new Map([
    [
      'cfn_aaaaaaaaaaaaaaaa',
      {
        usage: 'valueGenerator',
        source: `return 'tag-' + ctx.faker.string.alphanumeric(6);`,
      },
    ],
  ]),
);

async function run() {
  const pool = createSandboxPool({ size: 1, perCallTimeoutMs: 1000, memoryCapMb: 64 });

  const r1 = await runSet({ set, schemas, customFunctions, sandbox: pool });
  const r2 = await runSet({ set, schemas, customFunctions, sandbox: pool });

  let passed = 0;
  let failed = 0;
  const assert = (label: string, ok: boolean, detail?: unknown): void => {
    if (ok) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failed++;
      console.log(`  ✗ ${label}`, detail ?? '');
    }
  };

  const persons1 = r1.rowsByKey.get('person')!;
  const mobiles1 = r1.rowsByKey.get('mobile')!;
  const persons2 = r2.rowsByKey.get('person')!;
  const mobiles2 = r2.rowsByKey.get('mobile')!;

  assert('person count', persons1.length === 5);
  assert('mobile count', mobiles1.length === 8);
  assert('tag is a function-generated string', typeof persons1[0]!.tag === 'string');
  assert(
    'tag starts with "tag-"',
    typeof persons1[0]!.tag === 'string' && (persons1[0]!.tag as string).startsWith('tag-'),
  );
  assert(
    'mobile.personId substituted (not placeholder)',
    !isRefPlaceholder(mobiles1[0]!.personId),
  );
  assert(
    'mobile.personId is a known person id',
    persons1.map((p) => p.__id).includes(mobiles1[0]!.personId as string),
  );

  // Determinism: deep-equal across runs
  assert(
    'persons match across runs',
    JSON.stringify(persons1) === JSON.stringify(persons2),
  );
  assert(
    'mobiles match across runs',
    JSON.stringify(mobiles1) === JSON.stringify(mobiles2),
  );

  await pool.shutdown();
  console.log(`\nresult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run the smoke**

```bash
pnpm --filter @mirage/engine exec tsx scripts/run-set-smoke.mts
```

Expected: 7 assertions pass, exit 0.

- [ ] **Step 3: Verify typecheck/lint/prettier**

```bash
pnpm exec nx run-many -t typecheck,lint -p @mirage/engine --skip-nx-cache
pnpm exec prettier --check packages/engine
```

Expected: green.

---

## Task 13: Full repo verification

**Files:** (none modified — verification only)

- [ ] **Step 1: Full typecheck + lint across all 11 projects**

```bash
pnpm exec nx run-many -t typecheck,lint --skip-nx-cache
```

Expected: 11 projects + 1 dep task, all green.

- [ ] **Step 2: Confirm the SPA still builds**

```bash
pnpm exec nx run @mirage/web:build
```

Expected: build completes (chunk-size warning is pre-existing).

- [ ] **Step 3: Re-run both smoke scripts**

```bash
pnpm --filter @mirage/sandbox exec tsx scripts/sandbox-smoke.mts
pnpm --filter @mirage/engine exec tsx scripts/run-set-smoke.mts
```

Expected: both scripts exit 0 with all assertions green.

- [ ] **Step 4: Confirm prettier on touched paths**

```bash
pnpm exec prettier --check packages/engine packages/sandbox
```

Expected: clean.

---

## Self-review notes

- **Spec coverage:**
  - Engine type shape on OpenAPI → tasks 9, 10, 11.
  - Engine layout (rng, faker-engine, run-set) → tasks 6, 7, 11.
  - CustomFunctionRegistry reshape (`usage` field) → task 8.
  - Faker dep + sandbox dep on engine → task 5.
  - `resolveSchema` walk semantics (object/array/primitive, `$ref:`/`$fn:`/faker method) → task 9.
  - `applyStrategy` all four variants (1:1, random, evenSplit, custom) → task 10.
  - `runSet` orchestrator (cycle check, topo, strategy → ref substitution) → task 11.
  - Sandbox protocol change (sourceHash + nullable source + CacheMiss) → task 1.
  - Sandbox worker (vm context, cache, compileFunction, timeout) → task 2.
  - Sandbox pool (workers, free-list, queue, timers, replacement) → task 3.
  - Sandbox smoke (4 cases) → task 4.
  - Engine smoke (2-Schema set + determinism) → task 12.
  - Repo-wide green + SPA build → task 13.
- **No placeholders.** Every step contains the exact code or command needed.
- **Naming consistency:** `runSet`, `resolveSchema`, `applyStrategy`, `RefPlaceholder`, `isRefPlaceholder`, `mulberry32`, `hashSeed`, `createFakerEngine`, `EngineError`, `CustomFunctionEntry`, `CustomFunctionRegistry`, `sourceHash`, `CacheMiss` sentinel — used identically across files.
- **No commits scheduled.** Per project memory, the user commits work themselves.
