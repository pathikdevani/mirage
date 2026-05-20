import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { OrgId, RunId, RunKind, SetId, UserId, WorkspaceId } from '@mirage/types';
import { env } from './env.js';

export const RUNS_QUEUE = 'mirage-runs' as const;

export interface RunJobData {
  runId: RunId;
  setId: SetId;
  orgId: OrgId;
  workspaceId: WorkspaceId;
  requestedBy: UserId;
  kind: RunKind;
}

const producerConnection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });

export const runsQueue = new Queue<RunJobData>(RUNS_QUEUE, { connection: producerConnection });

export async function enqueueRunJob(data: RunJobData): Promise<void> {
  await runsQueue.add('run', data, {
    jobId: data.runId,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400 },
  });
}

export const cancelFlagKey = (runId: RunId): string => `run:${runId}:cancel`;
