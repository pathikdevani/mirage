import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';

export const s3 = new S3Client({
  endpoint: env.s3.endpoint,
  region: env.s3.region,
  credentials: { accessKeyId: env.s3.accessKey, secretAccessKey: env.s3.secretKey },
  forcePathStyle: env.s3.forcePathStyle,
});

export const runArtifactKey = (orgId: string, workspaceId: string, runId: string): string =>
  `org/${orgId}/workspace/${workspaceId}/run/${runId}.ndjson`;
