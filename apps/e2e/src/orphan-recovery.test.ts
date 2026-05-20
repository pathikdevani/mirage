/**
 * Regression test for the "stuck running" symptom the user reported after
 * killing `pnpm dev` mid-run.
 *
 * Scenario reproduced:
 *   1. A run was processing — Mongo has it at status='running'.
 *   2. The worker process died (Ctrl-C of `pnpm dev`, SIGKILL, crash).
 *   3. BullMQ still has the job in `active` because the dead worker never
 *      released the lock.
 *   4. (Maybe) the user clicked Cancel before the kill — cancel flag set in
 *      Redis.
 *   5. New worker starts; recoverOrphanedRuns runs once before consumers
 *      attach.
 *
 * Assertion: after recovery,
 *   - Mongo run is at 'failed' (or 'cancelled' if flag was set)
 *   - Cancel flag is cleared
 *   - The BullMQ job (if any) is gone from `active`
 *   - A run.failed / run.cancelled event was published on the Redis channel
 *     so any open SPA tab gets the correction without manual refresh.
 *
 * Uses real Mongo + Redis from the dev stack (same connections the worker
 * uses). Does not depend on the API or BFF.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import IORedis from 'ioredis';
import { MongoClient } from 'mongodb';
import { Queue } from 'bullmq';
import pino from 'pino';
import { nanoid } from './nanoid.js';
import { recoverOrphanedRuns } from '../../generation-worker/src/recover-orphans.js';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const MONGO_URL =
  process.env['MONGO_URL'] ??
  'mongodb://mirage:mirage@localhost:27017/mirage?authSource=admin';
const MONGO_DB = process.env['MONGO_DB'] ?? 'mirage';

const RUNS_QUEUE = 'mirage-runs';

interface MockRunDoc {
  id: string;
  orgId: string;
  workspaceId: string;
  setId: string;
  kind: 'full' | 'preview';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  requestedBy: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  errorMessage?: string;
}

describe('recoverOrphanedRuns (integration vs real Mongo + Redis)', () => {
  let mongo: MongoClient;
  let redisShared: IORedis;
  let bullConnection: IORedis;
  const insertedRunIds = new Set<string>();
  const logger = pino({ level: 'silent' });

  beforeAll(async () => {
    mongo = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 5000 });
    await mongo.connect();
    redisShared = new IORedis(REDIS_URL);
    bullConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  });

  afterAll(async () => {
    if (insertedRunIds.size > 0) {
      await mongo
        .db(MONGO_DB)
        .collection('runs')
        .deleteMany({ id: { $in: [...insertedRunIds] } });
    }
    await mongo.close();
    redisShared.disconnect();
    bullConnection.disconnect();
  });

  it('marks a stuck running run as failed and publishes run.failed', async () => {
    const runId = `run_orphan_failed_${nanoid()}`;
    const orgId = `org_test_${nanoid()}`;
    insertedRunIds.add(runId);

    await insertFakeRun(mongo, { runId, orgId });

    // Subscribe BEFORE recovery so we catch the published event.
    const subscriber = new IORedis(REDIS_URL);
    const channel = `org:${orgId}:run:${runId}`;
    const received: unknown[] = [];
    await subscriber.subscribe(channel);
    subscriber.on('message', (_ch, payload) => {
      try {
        received.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    });

    try {
      await recoverOrphanedRuns({
        db: makeWorkerDbShim(mongo),
        publisher: redisShared,
        cancelRedis: redisShared,
        bullConnection,
        logger,
      });

      // Mongo updated to failed
      const updated = await mongo.db(MONGO_DB).collection<MockRunDoc>('runs').findOne({ id: runId });
      expect(updated?.status).toBe('failed');
      expect(updated?.endedAt).toBeTruthy();
      expect(updated?.errorMessage).toMatch(/orphaned/i);

      // Event published — give pub/sub a beat to deliver
      await sleep(150);
      const failedEvents = received.filter(
        (e): e is { type: 'run.failed'; runId: string } =>
          typeof e === 'object' &&
          e !== null &&
          (e as { type?: string }).type === 'run.failed',
      );
      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0]!.runId).toBe(runId);
    } finally {
      await subscriber.unsubscribe(channel);
      subscriber.disconnect();
    }
  });

  it('marks a stuck running run with cancel flag as cancelled, publishes run.cancelled, clears flag', async () => {
    const runId = `run_orphan_cancel_${nanoid()}`;
    const orgId = `org_test_${nanoid()}`;
    insertedRunIds.add(runId);

    await insertFakeRun(mongo, { runId, orgId });
    await redisShared.set(`run:${runId}:cancel`, '1', 'EX', 600);

    const subscriber = new IORedis(REDIS_URL);
    const channel = `org:${orgId}:run:${runId}`;
    const received: unknown[] = [];
    await subscriber.subscribe(channel);
    subscriber.on('message', (_ch, payload) => {
      try {
        received.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    });

    try {
      await recoverOrphanedRuns({
        db: makeWorkerDbShim(mongo),
        publisher: redisShared,
        cancelRedis: redisShared,
        bullConnection,
        logger,
      });

      const updated = await mongo.db(MONGO_DB).collection<MockRunDoc>('runs').findOne({ id: runId });
      expect(updated?.status).toBe('cancelled');
      // Cancel flag cleared
      const flag = await redisShared.get(`run:${runId}:cancel`);
      expect(flag).toBeNull();
      // Event published
      await sleep(150);
      const cancelledEvents = received.filter(
        (e): e is { type: 'run.cancelled'; runId: string } =>
          typeof e === 'object' &&
          e !== null &&
          (e as { type?: string }).type === 'run.cancelled',
      );
      expect(cancelledEvents).toHaveLength(1);
    } finally {
      await subscriber.unsubscribe(channel);
      subscriber.disconnect();
    }
  });

  it('removes the orphan from the BullMQ active set so it cannot be re-picked', async () => {
    const runId = `run_orphan_bullmq_${nanoid()}`;
    const orgId = `org_test_${nanoid()}`;
    insertedRunIds.add(runId);

    await insertFakeRun(mongo, { runId, orgId });

    // Plant a fake BullMQ job with the matching runId, then forcibly move it
    // to 'active' to simulate a job whose worker was SIGKILLed.
    const queue = new Queue(RUNS_QUEUE, { connection: bullConnection });
    try {
      const job = await queue.add(
        'run',
        {
          runId,
          setId: 'set_fake',
          orgId,
          workspaceId: 'ws_fake',
          requestedBy: 'usr_fake',
          kind: 'full',
        },
        { jobId: runId },
      );
      // Job lives in `wait`; nudge to `active` to mirror the orphan state.
      await bullConnection.lrem(`bull:${RUNS_QUEUE}:wait`, 1, runId);
      await bullConnection.lpush(`bull:${RUNS_QUEUE}:active`, runId);

      // Sanity — it's in active before recovery.
      const activeBefore = await bullConnection.lrange(`bull:${RUNS_QUEUE}:active`, 0, -1);
      expect(activeBefore).toContain(runId);

      await recoverOrphanedRuns({
        db: makeWorkerDbShim(mongo),
        publisher: redisShared,
        cancelRedis: redisShared,
        bullConnection,
        logger,
      });

      // After recovery the BullMQ job is removed entirely.
      const stillThere = await queue.getJob(job.id!);
      expect(stillThere).toBeFalsy();
      const activeAfter = await bullConnection.lrange(`bull:${RUNS_QUEUE}:active`, 0, -1);
      expect(activeAfter).not.toContain(runId);
    } finally {
      await queue.close();
    }
  });
});

// ---------- helpers ----------

async function insertFakeRun(
  mongo: MongoClient,
  { runId, orgId }: { runId: string; orgId: string },
): Promise<void> {
  const now = new Date().toISOString();
  const doc: MockRunDoc = {
    id: runId,
    orgId,
    workspaceId: 'ws_test',
    setId: 'set_test',
    kind: 'full',
    status: 'running',
    requestedBy: 'usr_test',
    createdAt: now,
    startedAt: now,
  };
  await mongo.db(MONGO_DB).collection('runs').insertOne(doc as unknown as Record<string, unknown>);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Build a WorkerDb-shaped object backed by the test MongoClient. recoverOrphanedRuns
 * only reads from `runs`, so the other collections are unused.
 */
function makeWorkerDbShim(client: MongoClient): import('../../generation-worker/src/db.js').WorkerDb {
  const db = client.db(MONGO_DB);
  return {
    client,
    schemas: db.collection('schemas'),
    sets: db.collection('sets'),
    customFunctions: db.collection('custom_functions'),
    runs: db.collection('runs'),
  } as unknown as import('../../generation-worker/src/db.js').WorkerDb;
}
