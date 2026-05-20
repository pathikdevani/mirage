import { PassThrough } from 'node:stream';
import { Upload } from '@aws-sdk/lib-storage';
import type { S3Client } from '@aws-sdk/client-s3';
import { runArtifactKey } from './s3.js';

/**
 * NDJSON sink that streams to S3 via multipart upload. One row per line.
 * Close on success; abort on cancel/failure to avoid leaving an incomplete
 * multipart upload behind.
 *
 * Buffer sizing: PassThrough's `highWaterMark` is bumped above lib-storage's
 * minimum part size (5 MiB enforced by S3) so small artifacts (e.g. a 2k-row
 * run ~= 100 KB) never trigger a backpressure await that would deadlock
 * against lib-storage. lib-storage only flushes when it has a full part OR
 * the body stream ends — for tiny streams that means waiting for close(),
 * and if we're paused awaiting `drain` we never get there.
 */
const PASSTHROUGH_HIGH_WATER_MARK = 16 * 1024 * 1024; // 16 MiB

export class RunArtifactWriter {
  readonly key: string;
  private readonly stream = new PassThrough({ highWaterMark: PASSTHROUGH_HIGH_WATER_MARK });
  private readonly upload: Upload;
  private finished = false;

  constructor(opts: {
    orgId: string;
    workspaceId: string;
    runId: string;
    s3Client: S3Client;
    bucket: string;
  }) {
    this.key = runArtifactKey(opts.orgId, opts.workspaceId, opts.runId);
    this.upload = new Upload({
      client: opts.s3Client,
      params: {
        Bucket: opts.bucket,
        Key: this.key,
        Body: this.stream,
        ContentType: 'application/x-ndjson',
      },
    });
  }

  async writeRow(row: unknown): Promise<void> {
    if (this.finished) throw new Error('writer is closed');
    const line = JSON.stringify(row) + '\n';
    const ok = this.stream.write(line);
    // Backpressure only matters once lib-storage starts uploading parts (i.e.
    // total written > 5 MiB). Below that, lib-storage buffers internally and
    // never drains the PassThrough until close() — so awaiting drain would
    // deadlock. With a 16 MiB high-water mark the small-stream case never
    // hits this branch; large streams still get proper backpressure once
    // parts are flushing.
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
