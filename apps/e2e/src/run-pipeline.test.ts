import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadE2eEnv, type E2eEnv } from './env.js';
import { BffClient } from './client.js';
import {
  createPersonSchema,
  createSetWithCount,
  createWorkspace,
  deleteWorkspace,
  getRun,
  startRun,
  cancelRun,
} from './fixtures.js';
import { collectRunEvents, type RunEventLike } from './ws-collector.js';

let env: E2eEnv;
let bff: BffClient;

describe('end-to-end run pipeline', () => {
  let wsId: string;
  let schemaKey: string;

  beforeAll(async () => {
    env = await loadE2eEnv();
    bff = new BffClient(env);
    const ws = await createWorkspace(bff);
    wsId = ws.id;
    const schema = await createPersonSchema(bff, wsId);
    schemaKey = schema.key;
  });

  afterAll(async () => {
    if (wsId) await deleteWorkspace(bff, wsId);
  });

  it('streams progress events and completes a 2_000-row run', async () => {
    const COUNT = 2_000;
    const set = await createSetWithCount(bff, wsId, schemaKey, COUNT);
    const run = await startRun(bff, wsId, set.id);
    expect(run.id).toMatch(/^run_/);

    const events = await collectRunEvents({
      env,
      runId: run.id,
      timeoutMs: 90_000,
    });

    // ---- structural assertions on the event stream ----
    const types = events.map((e) => e.type);
    expect(types).toContain('run.completed');
    const lastType = types[types.length - 1];
    expect(lastType).toBe('run.completed');

    const progress = events.filter(
      (e): e is RunEventLike & { produced: number; total: number } =>
        e.type === 'run.progress' &&
        typeof e['produced'] === 'number' &&
        typeof e['total'] === 'number',
    );

    expect(progress.length, 'expected multiple run.progress events').toBeGreaterThanOrEqual(2);

    // total should be constant and equal to plan.totalRows = COUNT
    const totals = new Set(progress.map((e) => e.total));
    expect(totals.size, `total changed across events: ${[...totals].join(', ')}`).toBe(1);
    expect([...totals][0]).toBe(COUNT);

    // produced must be monotonically non-decreasing
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]!.produced).toBeGreaterThanOrEqual(progress[i - 1]!.produced);
    }
    // last progress event must hit total
    expect(progress[progress.length - 1]!.produced).toBe(COUNT);

    // ---- API truth matches ----
    const finalRun = await getRun(bff, wsId, run.id);
    expect(finalRun.status).toBe('completed');
    expect(finalRun.rowCounts?.[schemaKey]).toBe(COUNT);
  }, 120_000);

  it('cancels a run mid-flight within a few seconds', async () => {
    // Big enough that the pure-faker engine doesn't finish before our cancel
    // POST lands. 500k rows × ~5 μs/row ≈ 2.5 s wall time, plus S3 upload,
    // is comfortably longer than the 250 ms cancel poll + per-row signal
    // check window.
    const COUNT = 500_000;
    const set = await createSetWithCount(bff, wsId, schemaKey, COUNT);
    const run = await startRun(bff, wsId, set.id);

    // Wait until we see the run is actually running (first progress event
    // beyond the initial 0/N), then send cancel. Surface failures from the
    // cancel POST instead of swallowing them.
    const cancelSentAt: { ts: number | null } = { ts: null };
    let cancelPostError: unknown = null;
    const events = await collectRunEvents({
      env,
      runId: run.id,
      timeoutMs: 90_000,
      onEvent: (e) => {
        if (cancelSentAt.ts !== null) return;
        if (e.type !== 'run.progress') return;
        const produced = (e as unknown as { produced?: number }).produced;
        if (typeof produced !== 'number' || produced <= 0) return;
        cancelSentAt.ts = Date.now();
        void cancelRun(bff, wsId, run.id).catch((err: unknown) => {
          cancelPostError = err;
        });
      },
    });

    expect(cancelPostError, `cancel POST failed: ${String(cancelPostError)}`).toBeNull();
    expect(cancelSentAt.ts, 'cancel was never sent because no progress event arrived').not.toBeNull();

    const types = events.map((e) => e.type);
    expect(types).toContain('run.cancelled');
    const lastType = types[types.length - 1];
    expect(lastType).toBe('run.cancelled');

    const cancelledEvent = events.find((e) => e.type === 'run.cancelled')!;
    const cancelledAtIso = (cancelledEvent as { at?: string }).at;
    const cancelledAtMs = cancelledAtIso ? Date.parse(cancelledAtIso) : Date.now();
    const latencyMs = cancelledAtMs - cancelSentAt.ts!;
    // Per-row signal check + 250 ms cancel poll → expect <5 s wall time.
    // Tolerate up to 30 s to absorb sandbox/IO noise on slow dev boxes.
    expect(latencyMs).toBeLessThan(30_000);

    // The run should not have completed all rows.
    const finalRun = await getRun(bff, wsId, run.id);
    expect(finalRun.status).toBe('cancelled');
  }, 120_000);
});
