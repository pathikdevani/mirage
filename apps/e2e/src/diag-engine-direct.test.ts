/**
 * Diagnostic — bypasses the worker entirely. Calls the engine in-process to
 * confirm whether the "hangs after 2 batches" symptom is in the engine itself
 * or in the worker's writer/publish path.
 */
import { describe, it, expect } from 'vitest';
import { runSetStream } from '../../../packages/engine/src/run-set-stream.js';
import { customFunctionRegistryFromMap } from '../../../packages/engine/src/custom-function-registry.js';
import type { Api } from '../../../packages/types/src/index.js';
import type { SandboxPool } from '../../../packages/sandbox/src/types.js';

const fakeSandbox = { invoke: async () => null } as unknown as SandboxPool;

const schema: Api.components['schemas']['Schema'] = {
  id: 'sch_person',
  workspaceId: 'ws_1',
  orgId: 'org_1',
  key: 'person',
  name: 'person',
  description: '',
  color: 'cyan',
  icon: 'User',
  tags: [],
  properties: [
    { name: 'id', type: 'string', faker: 'string.uuid', required: false },
    { name: 'name', type: 'string', faker: 'person.firstName', required: false },
  ],
  createdBy: 'u',
  createdAt: '2026-05-20T00:00:00Z',
  updatedAt: '2026-05-20T00:00:00Z',
} as Api.components['schemas']['Schema'];

const set: Api.components['schemas']['Set'] = {
  id: 'set_1',
  workspaceId: 'ws_1',
  orgId: 'org_1',
  key: 'demo',
  name: 'demo',
  description: '',
  color: 'violet',
  icon: 'Boxes',
  tags: [],
  salt: 'salt',
  schemas: [{ schemaKey: 'person', count: 2000 }],
  strategies: [],
  output: { format: 'ndjson', locale: 'en', workerPool: 1 },
  createdBy: 'u',
  createdAt: '2026-05-20T00:00:00Z',
  updatedAt: '2026-05-20T00:00:00Z',
} as Api.components['schemas']['Set'];

describe('engine in-process — should NOT hang', () => {
  it('streams all 4 batches for 2000 rows of a primitive-only schema', async () => {
    const batches: Array<{ schemaProduced: number; totalProduced: number; rowsLen: number }> = [];
    const start = Date.now();
    for await (const batch of runSetStream({
      set,
      schemas: [schema],
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
      batchSize: 500,
    })) {
      batches.push({
        schemaProduced: batch.schemaProduced,
        totalProduced: batch.totalProduced,
        rowsLen: batch.rows.length,
      });
    }
    const elapsed = Date.now() - start;
    console.log(`[diag-engine] batches=${batches.length} elapsed=${elapsed}ms`, batches);
    expect(batches).toHaveLength(4);
    expect(batches[batches.length - 1]!.totalProduced).toBe(2000);
  }, 30_000);
});
