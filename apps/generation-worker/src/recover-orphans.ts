import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import type { OrgId, RunCancelledEvent, RunFailedEvent, RunId } from '@mirage/types';
import type { WorkerDb } from './db.js';
import { PREVIEWS_QUEUE, RUNS_QUEUE, cancelFlagKey, runChannel } from './queues.js';

/**
 * Recover runs left at `status: 'running'` by a previous worker process that
 * died mid-execution (tsx watch restart, Ctrl-C of `pnpm dev`, crash, SIGKILL).
 *
 * Per-run liveness check: before marking a run failed we verify that no peer
 * worker is still actively processing it. BullMQ holds a TTL'd lock key
 * (`bull:<queue>:<jobId>:lock`) for the duration of `Worker.process`; if that
 * key is still present, another live worker owns the job and recovery must
 * leave it alone. Without this check, every worker startup (including a
 * `tsx watch` restart in dev) would blow away every in-flight run.
 *
 * We:
 *   1. Find every Mongo run with status='running'.
 *   2. Skip any whose BullMQ lock is still held — a peer worker has it.
 *   3. For the rest, mark 'cancelled' (if a cancel flag was set) or 'failed',
 *      publish the matching terminal event, and clear the cancel flag.
 *   4. Drop the corresponding BullMQ job from `active` so it can't be
 *      re-picked by the stalled-job check 30 s later.
 */
const lockKey = (queueName: string, runId: string): string =>
  `bull:${queueName}:${runId}:lock`;

export async function recoverOrphanedRuns(args: {
  db: WorkerDb;
  publisher: Redis;
  cancelRedis: Redis;
  bullConnection: Redis;
  logger: Logger;
}): Promise<void> {
  const { db, publisher, cancelRedis, bullConnection, logger } = args;

  const runsQueue = new Queue(RUNS_QUEUE, { connection: bullConnection });
  const previewsQueue = new Queue(PREVIEWS_QUEUE, { connection: bullConnection });

  try {
    const runningRuns = (await db.runs
      .find(
        { status: 'running' },
        { projection: { _id: 0, id: 1, orgId: 1, startedAt: 1 } },
      )
      .toArray()) as Array<{ id: string; orgId: string; startedAt?: string }>;

    if (runningRuns.length === 0) {
      logger.info('no orphaned runs to recover');
      return;
    }

    const endedAt = new Date().toISOString();
    const cancelled: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];

    for (const r of runningRuns) {
      const [runLock, prevLock] = await Promise.all([
        bullConnection.get(lockKey(RUNS_QUEUE, r.id)),
        bullConnection.get(lockKey(PREVIEWS_QUEUE, r.id)),
      ]);
      if (runLock !== null || prevLock !== null) {
        skipped.push(r.id);
        continue;
      }

      const wasCancelled = (await cancelRedis.get(cancelFlagKey(r.id as RunId))) === '1';
      const status = wasCancelled ? 'cancelled' : 'failed';
      const errorMessage = wasCancelled
        ? undefined
        : 'Worker restarted while run was active (orphaned). Retry the run.';

      const updateRes = await db.runs.updateOne(
        { id: r.id, status: 'running' },
        {
          $set: {
            status,
            endedAt,
            ...(errorMessage ? { errorMessage } : {}),
          },
        },
      );
      if (updateRes.modifiedCount === 0) continue;
      (wasCancelled ? cancelled : failed).push(r.id);

      const event: RunFailedEvent | RunCancelledEvent = wasCancelled
        ? { type: 'run.cancelled', runId: r.id as RunId, at: endedAt }
        : {
            type: 'run.failed',
            runId: r.id as RunId,
            message: errorMessage!,
            at: endedAt,
          };
      try {
        await publisher.publish(
          runChannel(r.orgId as OrgId, r.id as RunId),
          JSON.stringify(event),
        );
      } catch (err) {
        logger.warn({ err, runId: r.id }, 'failed to publish recovery event');
      }

      try {
        await cancelRedis.del(cancelFlagKey(r.id as RunId));
      } catch (err) {
        logger.warn({ err, runId: r.id }, 'failed to clear cancel flag');
      }

      // Best-effort: drop the BullMQ job so its stalled-check can't re-pick
      // it. Both queues are tried because we don't know which one held it.
      for (const queue of [runsQueue, previewsQueue]) {
        try {
          const job = await queue.getJob(r.id);
          if (job) await job.remove();
        } catch (err) {
          logger.debug({ err, runId: r.id, queue: queue.name }, 'bullmq remove failed');
        }
      }
    }

    logger.warn(
      {
        cancelledCount: cancelled.length,
        failedCount: failed.length,
        skippedCount: skipped.length,
        cancelled,
        failed,
        skipped,
      },
      'recovered orphaned runs from previous worker session',
    );
  } finally {
    await runsQueue.close();
    await previewsQueue.close();
  }
}
