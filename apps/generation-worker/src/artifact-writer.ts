import { PassThrough } from 'node:stream';
import { Upload } from '@aws-sdk/lib-storage';
import type { S3Client } from '@aws-sdk/client-s3';
import { runArtifactKey } from './s3.js';

/**
 * NDJSON sink that streams to S3 via multipart upload. One row per line.
 * Close on success; abort on cancel/failure to avoid leaving an incomplete
 * multipart upload behind.
 *
 * Drain ordering: `Upload.done()` is what actually attaches lib-storage as a
 * consumer of the body stream. We kick it off in the constructor so the
 * stream starts draining as soon as the first part-sized chunk lands — if we
 * waited until `close()`, large runs would deadlock at the PassThrough
 * high-water mark with no reader on the other end.
 */
const PASSTHROUGH_HIGH_WATER_MARK = 16 * 1024 * 1024; // 16 MiB

export class RunArtifactWriter {
  readonly key: string;
  private readonly stream = new PassThrough({ highWaterMark: PASSTHROUGH_HIGH_WATER_MARK });
  private readonly upload: Upload;
  private readonly uploadDone: Promise<unknown>;
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
    // Start consuming the body stream immediately. The promise is awaited in
    // close()/abort(); attach a no-op catch so an early reject (e.g. abort)
    // never surfaces as an unhandled rejection before someone awaits it.
    this.uploadDone = this.upload.done();
    this.uploadDone.catch(() => undefined);
  }

  async writeRow(row: unknown): Promise<void> {
    if (this.finished) throw new Error('writer is closed');
    const line = JSON.stringify(row) + '\n';
    const ok = this.stream.write(line);
    if (!ok) await new Promise<void>((resolve) => this.stream.once('drain', () => resolve()));
  }

  async close(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.stream.end();
    await this.uploadDone;
  }

  async abort(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    try {
      await this.upload.abort();
    } finally {
      this.stream.destroy();
      // Swallow the inevitable rejection of the in-flight upload promise.
      await this.uploadDone.catch(() => undefined);
    }
  }
}
