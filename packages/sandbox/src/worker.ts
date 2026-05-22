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
import { Faker, allLocales } from '@mirage/fakerjs';
import type { SandboxMessageFromWorker, SandboxMessageToWorker } from './protocol.js';

if (!parentPort) {
  throw new Error('sandbox worker started outside a worker_threads context');
}

const ctx = vm.createContext({});
const cache = new Map<string, (args: unknown) => unknown>();

// One faker instance per worker, lazily constructed. The engine triggers
// reseeding by including `__fakerSeed` (and optionally `__fakerLocale`) on the
// args object; the worker swaps the seeded faker onto `ctx.faker` before
// invoking the user function. Functions that don't need faker (e.g. Strategy
// calls) simply omit the field.
let cachedLocale: string | null = null;
let cachedFaker: Faker | null = null;
function fakerFor(locale: string): Faker {
  if (cachedFaker && cachedLocale === locale) return cachedFaker;
  const def = (allLocales as Record<string, (typeof allLocales)['en']>)[locale] ?? allLocales.en;
  cachedFaker = new Faker({ locale: [def, allLocales.en] });
  cachedLocale = locale;
  return cachedFaker;
}

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
      }) as (args: unknown) => unknown;
      cache.set(sourceHash, fn);
    }
    // Enrich args with faker + rng if the engine asked for it (signaled by
    // __fakerSeed / __rngSeed). The user sees `ctx.faker` as a normal faker
    // instance and `ctx.rng` as a deterministic 0..1 PRNG. We do this in the
    // worker because functions and class instances aren't structured-cloneable.
    let enrichedArgs: unknown = args;
    if (args && typeof args === 'object') {
      const a = { ...(args as Record<string, unknown>) };
      const fakerSeed = typeof a['__fakerSeed'] === 'number' ? (a['__fakerSeed'] as number) : null;
      if (fakerSeed !== null) {
        const locale =
          typeof a['__fakerLocale'] === 'string' ? (a['__fakerLocale'] as string) : 'en';
        const f = fakerFor(locale);
        f.seed(fakerSeed);
        a['faker'] = f;
        delete a['__fakerSeed'];
        delete a['__fakerLocale'];
      }
      const rngSeed = typeof a['__rngSeed'] === 'number' ? (a['__rngSeed'] as number) : null;
      if (rngSeed !== null) {
        let s = rngSeed >>> 0;
        a['rng'] = function (): number {
          s = (s + 0x6d2b79f5) >>> 0;
          let t = s;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        delete a['__rngSeed'];
      }
      enrichedArgs = a;
    }

    // Invocation timeout: wrap the call in vm.runInContext so we can pass
    // `timeout`. The compiled function is in the same context, so we expose
    // it via a one-shot global.
    (ctx as unknown as { __mirage_fn?: typeof fn }).__mirage_fn = fn;
    (ctx as unknown as { __mirage_args?: unknown }).__mirage_args = enrichedArgs;
    try {
      const value = vm.runInContext('__mirage_fn(__mirage_args)', ctx, { timeout: timeoutMs });
      return { type: 'result', callId, ok: true, value };
    } finally {
      delete (ctx as unknown as { __mirage_fn?: typeof fn }).__mirage_fn;
      delete (ctx as unknown as { __mirage_args?: unknown }).__mirage_args;
    }
  } catch (e) {
    const rawName = e instanceof Error ? e.name : 'Error';
    const message = e instanceof Error ? e.message : String(e);
    let errorName = rawName;
    if (rawName === 'Error') {
      if (/timed out/i.test(message)) errorName = 'TimeoutError';
      else if (/^SyntaxError:/i.test(message)) errorName = 'SyntaxError';
    }
    const stack =
      e instanceof Error && typeof e.stack === 'string'
        ? e.stack.split('\n').slice(0, 6).join('\n')
        : undefined;
    return {
      type: 'result',
      callId,
      ok: false,
      errorName,
      errorMessage: message,
      ...(stack ? { stack } : {}),
    };
  }
}

parentPort.on('message', (msg: SandboxMessageToWorker) => {
  const reply = handle(msg);
  parentPort!.postMessage(reply);
});

// Surface unhandled errors as a fatal exit so the pool can recycle the worker.
process.on('uncaughtException', (err) => {
  console.error('sandbox worker uncaughtException:', err);
  process.exit(1);
});

export type WorkerHandler = typeof handle;
