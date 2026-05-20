import { PassThrough } from 'node:stream';
import { Upload } from '@aws-sdk/lib-storage';
import type { S3Client } from '@aws-sdk/client-s3';
import { runArtifactKey } from './s3.js';

/**
 * NDJSON sink that streams to S3 via multipart upload. One row per line.
 * Close on success; abort on cancel/failure to avoid leaving an incomplete
 * multipart upload behind.
 */
export class RunArtifactWriter {
  readonly key: string;
  private readonly stream = new PassThrough();
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
