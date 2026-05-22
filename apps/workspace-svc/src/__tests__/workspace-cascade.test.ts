import { describe, it, expect } from 'vitest';
import { asId, type WorkspaceId } from '@mirage/types';
import { createWorkspaceCascade, type CascadePorts } from '../workspace-cascade.js';

const noopLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => noopLog,
  level: 'info',
} as unknown as Parameters<typeof createWorkspaceCascade>[0]['log'];

function makePorts(overrides: Partial<CascadePorts> = {}): CascadePorts & {
  calls: string[];
} {
  const calls: string[] = [];
  const base: CascadePorts = {
    async countActiveRuns() { calls.push('count'); return 0; },
    async purgeS3Prefix(orgId, wsId) { calls.push(`s3:${orgId}/${wsId}`); },
    async purgeMongo(wsId) { calls.push(`mongo:${wsId}`); },
    async lookupSoftDeleted(wsId) { return { orgId: `org-of-${wsId}` }; },
    async listSoftDeleted() { return []; },
    ...overrides,
  };
  return Object.assign(base, { calls });
}

const WS = asId<WorkspaceId>('ws_test');

describe('workspace-cascade', () => {
  it('runs drain → s3 → mongo in order when there are no active runs', async () => {
    const ports = makePorts();
    const cascade = createWorkspaceCascade({ log: noopLog, ports, drainPollMs: 1 });
    cascade.enqueue(WS);
    await cascade.waitIdle();
    expect(ports.calls).toEqual(['count', `s3:org-of-${WS}/${WS}`, `mongo:${WS}`]);
  });

  it('is a no-op when the workspace is not soft-deleted', async () => {
    const ports = makePorts({ async lookupSoftDeleted() { return null; } });
    const cascade = createWorkspaceCascade({ log: noopLog, ports, drainPollMs: 1 });
    cascade.enqueue(WS);
    await cascade.waitIdle();
    expect(ports.calls).toEqual([]);
  });

  it('coalesces a re-enqueue while a cascade is in flight', async () => {
    let gate: (() => void) | null = null;
    const ports = makePorts({
      async countActiveRuns() {
        ports.calls.push('count');
        // Block the first cascade in its drain phase until the test releases it.
        await new Promise<void>((resolve) => {
          gate = resolve;
        });
        return 0;
      },
    });
    const cascade = createWorkspaceCascade({ log: noopLog, ports, drainPollMs: 1 });
    cascade.enqueue(WS);
    // Yield until the cascade reaches countActiveRuns and parks on the gate.
    while (!gate) await new Promise((r) => setImmediate(r));
    cascade.enqueue(WS);
    cascade.enqueue(WS);
    (gate as () => void)();
    await cascade.waitIdle();
    expect(ports.calls.filter((c) => c.startsWith('s3:')).length).toBe(1);
    expect(ports.calls.filter((c) => c.startsWith('mongo:')).length).toBe(1);
  });

  it('polls drain until count reaches zero, then proceeds', async () => {
    let remaining = 3;
    const ports = makePorts({
      async countActiveRuns() {
        ports.calls.push('count');
        return remaining-- > 0 ? remaining + 1 : 0;
      },
    });
    const cascade = createWorkspaceCascade({ log: noopLog, ports, drainPollMs: 1 });
    cascade.enqueue(WS);
    await cascade.waitIdle();
    expect(ports.calls.filter((c) => c === 'count').length).toBeGreaterThanOrEqual(3);
    expect(ports.calls.filter((c) => c.startsWith('s3:')).length).toBe(1);
    expect(ports.calls.filter((c) => c.startsWith('mongo:')).length).toBe(1);
  });

  it('force-proceeds after drain timeout if runs never drain', async () => {
    const ports = makePorts({ async countActiveRuns() { return 5; } });
    const cascade = createWorkspaceCascade({
      log: noopLog,
      ports,
      drainPollMs: 1,
      drainTimeoutSec: 0,
    });
    cascade.enqueue(WS);
    await cascade.waitIdle();
    expect(ports.calls.filter((c) => c.startsWith('s3:')).length).toBe(1);
    expect(ports.calls.filter((c) => c.startsWith('mongo:')).length).toBe(1);
  });

  it('runStartupSweep enqueues every soft-deleted workspace', async () => {
    const a = asId<WorkspaceId>('ws_a');
    const b = asId<WorkspaceId>('ws_b');
    const ports = makePorts({ async listSoftDeleted() { return [a, b]; } });
    const cascade = createWorkspaceCascade({ log: noopLog, ports, drainPollMs: 1 });
    await cascade.runStartupSweep();
    await cascade.waitIdle();
    expect(ports.calls.filter((c) => c.startsWith('mongo:'))).toEqual([
      `mongo:${a}`,
      `mongo:${b}`,
    ]);
  });
});
