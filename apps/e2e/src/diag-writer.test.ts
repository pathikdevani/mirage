/**
 * Diagnostic — exercises the worker's S3 writer pattern (RunArtifactWriter)
 * to isolate whether the "hangs after 2 batches" symptom is backpressure on
 * the multipart upload path.
 *
 * Inlines the writer (instead of importing the worker's `s3.ts`, which
 * triggers env validation that requires MONGO_URL). The behavior is
 * identical to apps/generation-worker/src/artifact-writer.ts.
 */
import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { runSetStream } from '../../../packages/engine/src/run-set-stream.js';
import { customFunctionRegistryFromMap } from '../../../packages/engine/src/custom-function-registry.js';
import type { Api } from '../../../packages/types/src/index.js';
import type { SandboxPool } from '../../../packages/sandbox/src/types.js';

// Match the production writer's high-water mark — see
// apps/generation-worker/src/artifact-writer.ts. Must be > lib-storage's
// 5 MiB minimum part size, otherwise small streams deadlock waiting for
// drain that never fires.
const HIGH_WATER_MARK = 16 * 1024 * 1024;

class InlineWriter {
  private readonly stream = new PassThrough({ highWaterMark: HIGH_WATER_MARK });
  private readonly upload: Upload;
  private finished = false;
  constructor(s3: S3Client, bucket: string, key: string) {
    this.upload = new Upload({
      client: s3,
      params: { Bucket: bucket, Key: key, Body: this.stream, ContentType: 'application/x-ndjson' },
    });
  }
  async writeRow(row: unknown): Promise<void> {
    if (this.finished) throw new Error('writer closed');
    const line = JSON.stringify(row) + '\n';
    const ok = this.stream.write(line);
    if (!ok) await new Promise<void>((resolve) => this.stream.once('drain', () => resolve()));
  }
  async close(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.stream.end();
    await this.upload.done();
  }
  async abort(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    try {
      await this.upload.abort();
    } finally {
      this.stream.destroy();
    }
  }
}

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
    { name: 'id', type: 'string', value: [{ kind: 'method', method: 'string.uuid' }], required: false },
    { name: 'name', type: 'string', value: [{ kind: 'method', method: 'person.firstName' }], required: false },
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

describe('worker writer path — in-process', () => {
  it('streams 2000 rows through a real S3 multipart upload without hanging', async () => {
    const s3 = new S3Client({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      credentials: { accessKeyId: 'miragedev', secretAccessKey: 'miragedev-secret' },
      forcePathStyle: true,
    });
    const key = `diag/${Date.now()}.ndjson`;
    const writer = new InlineWriter(s3, 'mirage', key);

    let batchCount = 0;
    let rowsWritten = 0;
    const start = Date.now();

    try {
      for await (const batch of runSetStream({
        set,
        schemas: [schema],
        customFunctions: customFunctionRegistryFromMap(new Map()),
        sandbox: fakeSandbox,
        batchSize: 500,
      })) {
        batchCount++;
        for (const row of batch.rows) {
          await writer.writeRow({ __schemaKey: batch.schemaKey, ...(row as object) });
          rowsWritten++;
        }
        console.log(
          `[diag-writer] batch=${batchCount} rows=${rowsWritten} elapsed=${Date.now() - start}ms`,
        );
      }
      const closeStart = Date.now();
      await writer.close();
      console.log(`[diag-writer] close() done in ${Date.now() - closeStart}ms (total ${Date.now() - start}ms)`);
    } catch (err) {
      await writer.abort().catch(() => undefined);
      throw err;
    }

    expect(batchCount).toBe(4);
    expect(rowsWritten).toBe(2000);
  }, 60_000);
});
