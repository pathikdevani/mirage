import { GetObjectCommand, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import type { OrgId, RunId, WorkspaceId } from '@mirage/types';
import { env } from './env.js';

/**
 * Single S3 client pointing at MinIO in dev (or AWS S3 in prod). Path-style
 * URLs because MinIO doesn't support virtual-hosted style on localhost.
 */
export const s3 = new S3Client({
  endpoint: env.s3.endpoint,
  region: env.s3.region,
  credentials: { accessKeyId: env.s3.accessKey, secretAccessKey: env.s3.secretKey },
  forcePathStyle: env.s3.forcePathStyle,
});

/**
 * Per TECH_ARCHITECHRE.md §6, run artifacts are keyed by
 * `org/{orgId}/workspace/{workspaceId}/run/{runId}.ndjson`. This helper is
 * the *only* place that name is constructed — change here once if the layout
 * ever shifts.
 */
export const runArtifactKey = (orgId: OrgId, workspaceId: WorkspaceId, runId: RunId): string =>
  `org/${orgId}/workspace/${workspaceId}/run/${runId}.ndjson`;

export interface RunArtifactStream {
  /** Body is a Node Readable yielding NDJSON. Each line is a single row. */
  body: NodeJS.ReadableStream;
}

/** Fetch a Run artifact from object storage. Throws if the key doesn't exist. */
export async function fetchRunArtifact(args: {
  orgId: OrgId;
  workspaceId: WorkspaceId;
  runId: RunId;
}): Promise<RunArtifactStream> {
  const key = runArtifactKey(args.orgId, args.workspaceId, args.runId);
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    if (!resp.Body) {
      throw new Error(`S3 GetObject returned empty body for ${key}`);
    }
    return { body: resp.Body as NodeJS.ReadableStream };
  } catch (err) {
    if (err instanceof NoSuchKey) {
      throw new RunArtifactNotFoundError(args.runId);
    }
    throw err;
  }
}

export class RunArtifactNotFoundError extends Error {
  override readonly name = 'RunArtifactNotFoundError';
  constructor(runId: RunId) {
    super(`No artifact in object storage for run ${runId}`);
  }
}
