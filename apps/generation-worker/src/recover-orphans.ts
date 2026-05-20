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
 * Aggressive (dev-friendly) recovery: on startup we ARE the worker, and this
 * codebase only runs a single worker process. Any Mongo run still tagged
 * `running` MUST be orphaned, period — no live processor is keeping it alive.
 * BullMQ's own `active` list is stale after a SIGKILL because the dead
 * processor never released its job lock; we can't rely on `active` to tell
 * us which runs are still being processed.
 *
 * We:
 *   1. Find every Mongo run with status='running'.
 *   2. Mark each as 'cancelled' (if a cancel flag was set) or 'failed'
 *      (otherwise), publish the matching terminal event, clear cancel flag.
 *   3. Drop the corresponding BullMQ job from `active` so it can't be
 *      re-picked by the stalled-job check 30 s later.
 *
 * Caveat: in a multi-worker production deployment this would race with peer
 * workers. Add an opt-out (env flag) before deploying with N>1 workers.
 */
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

    for (const r of runningRuns) {
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
        cancelled,
        failed,
      },
      'recovered orphaned runs from previous worker session',
    );
  } finally {
    await runsQueue.close();
    await previewsQueue.close();
  }
}
