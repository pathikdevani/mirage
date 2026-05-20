import type Redis from 'ioredis';
import type { RunId } from '@mirage/types';
import { cancelFlagKey } from './queues.js';

export async function isCancelled(redis: Redis, runId: RunId): Promise<boolean> {
  const value = await redis.get(cancelFlagKey(runId));
  return value === '1';
}
