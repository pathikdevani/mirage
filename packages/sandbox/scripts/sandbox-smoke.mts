/**
 * Manual sandbox smoke. Run via:
 *   pnpm --filter @mirage/sandbox exec tsx scripts/sandbox-smoke.mts
 *
 * Checks: trivial call, cache hit, timeout, no Node globals, compile error.
 */
import { createSandboxPool } from '../src/pool.ts';
import { SandboxCompileError, SandboxRuntimeError, SandboxTimeoutError } from '../src/types.ts';

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

  // 4. no Node globals — process should be undefined
  const tp = await pool.invoke('return typeof process;', {});
  assert('process is undefined inside sandbox', tp === 'undefined', tp);

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
