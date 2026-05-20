/**
 * Soak test — locks down the failure the user reported on 2026-05-20:
 *   "When I run a set with 1,000,000 rows it starts running but at ~321,500 it
 *    fails."
 *
 * Reproduces the exact schema shape: one faker field + one sandboxed
 * value-generator field, so every row roundtrips through the worker_threads
 * sandbox. The run must complete with all 1,000,000 rows accounted for; any
 * `run.failed` (incl. the orphan-recovery "Worker restarted while run was
 * active" message) fails the test.
 *
 * OPT-IN — this takes ~10–20 minutes against the dev stack. Skipped unless
 * MIRAGE_RUN_SOAK=1 is set. Run with:
 *
 *   MIRAGE_RUN_SOAK=1 pnpm --filter @mirage/e2e test -- run-1m-soak
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadE2eEnv, type E2eEnv } from './env.js';
import { BffClient } from './client.js';
import {
  createPersonSchemaWithCustomFn,
  createSetWithCount,
  createValueGeneratorFn,
  createWorkspace,
  deleteWorkspace,
  getRun,
  startRun,
} from './fixtures.js';
import { collectRunEvents, type RunEventLike } from './ws-collector.js';

const RUN_SOAK = process.env['MIRAGE_RUN_SOAK'] === '1';
const COUNT = 1_000_000;
// 30-minute budget — leaves headroom over the observed ~15 min steady-state
// throughput on a dev laptop, while still failing loudly on a stuck run.
const SOAK_TIMEOUT_MS = 30 * 60 * 1000;

let env: E2eEnv;
let bff: BffClient;

describe.runIf(RUN_SOAK)('1M-row soak run with sandbox value-generator', () => {
  let wsId: string;
  let schemaKey: string;

  beforeAll(async () => {
    env = await loadE2eEnv();
    bff = new BffClient(env);
    const ws = await createWorkspace(bff);
    wsId = ws.id;
    const fn = await createValueGeneratorFn(bff, wsId, 'return "test"');
    const schema = await createPersonSchemaWithCustomFn(bff, wsId, fn.id);
    schemaKey = schema.key;
  }, 60_000);

  afterAll(async () => {
    if (wsId) await deleteWorkspace(bff, wsId);
  });

  it(
    `completes a ${COUNT.toLocaleString()}-row run end-to-end`,
    async () => {
      const set = await createSetWithCount(bff, wsId, schemaKey, COUNT);
      const run = await startRun(bff, wsId, set.id);

      let lastLoggedDecile = -1;
      const events = await collectRunEvents({
        env,
        runId: run.id,
        timeoutMs: SOAK_TIMEOUT_MS,
        onEvent: (e) => {
          if (e.type !== 'run.progress') return;
          const produced = (e as { produced?: number }).produced;
          if (typeof produced !== 'number') return;
          const decile = Math.floor((produced / COUNT) * 10);
          if (decile > lastLoggedDecile) {
            lastLoggedDecile = decile;
            // eslint-disable-next-line no-console
            console.log(`[soak] ${produced.toLocaleString()} / ${COUNT.toLocaleString()}`);
          }
        },
      });

      const terminal = events.find(
        (e) =>
          e.type === 'run.completed' || e.type === 'run.failed' || e.type === 'run.cancelled',
      );
      const failed = events.find((e): e is RunEventLike & { message?: string } => e.type === 'run.failed');
      expect(
        failed,
        `run.failed received: ${failed?.message ?? '<no message>'}`,
      ).toBeUndefined();
      expect(terminal?.type, 'expected run.completed terminal event').toBe('run.completed');

      const progress = events.filter(
        (e): e is RunEventLike & { produced: number; total: number } =>
          e.type === 'run.progress' &&
          typeof e['produced'] === 'number' &&
          typeof e['total'] === 'number',
      );
      for (let i = 1; i < progress.length; i++) {
        expect(progress[i]!.produced).toBeGreaterThanOrEqual(progress[i - 1]!.produced);
      }
      expect(progress[progress.length - 1]!.produced).toBe(COUNT);

      const finalRun = await getRun(bff, wsId, run.id);
      expect(finalRun.status).toBe('completed');
      expect(finalRun.rowCounts?.[schemaKey]).toBe(COUNT);
    },
    SOAK_TIMEOUT_MS + 60_000,
  );
});
