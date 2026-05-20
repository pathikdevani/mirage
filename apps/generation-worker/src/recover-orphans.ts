import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import type { OrgId, RunCancelledEvent, RunFailedEvent, RunId } from '@mirage/types';
import type { WorkerDb } from './db.js';
import { PREVIEWS_QUEUE, RUNS_QUEUE, cancelFlagKey, runChannel } from './queues.js';

/**
 * Recover runs left at `status: 'running'` by a previous worker process that
 * died mid-execution (tsx watch restart, crash, SIGKILL, etc.).
 *
 * On startup we are, by definition, processing zero jobs. Any run that Mongo
 * still thinks is running but isn't in either BullMQ queue's `active` set is
 * orphaned — mark it `failed` (or `cancelled` if a cancel flag was set while
 * it was being processed) and publish the matching terminal event so any
 * still-connected SPA gets the correction.
 *
 * Safe to run with multiple workers because we only consider runs whose runId
 * is NOT in the live BullMQ active set across both queues — if another worker
 * is currently processing it, the runId WILL be in active.
 */
export async function recoverOrphanedRuns(args: {
  db: WorkerDb;
  publisher: Redis;
  cancelRedis: Redis;
  bullConnection: Redis;
  logger: Logger;
}): Promise<void> {
  const { db, publisher, cancelRedis, bullConnection, logger } = args;

  // Use a short-lived Queue handle for inspection only; close at end.
  const runsQueue = new Queue(RUNS_QUEUE, { connection: bullConnection });
  const previewsQueue = new Queue(PREVIEWS_QUEUE, { connection: bullConnection });
  let runningRuns: Array<{ id: string; orgId: string; startedAt?: string }> = [];
  try {
    const [runsActive, previewsActive] = await Promise.all([
      runsQueue.getActive(),
      previewsQueue.getActive(),
    ]);
    const activeIds = new Set<string>();
    for (const j of runsActive) if (typeof j.id === 'string') activeIds.add(j.id);
    for (const j of previewsActive) if (typeof j.id === 'string') activeIds.add(j.id);

    runningRuns = (await db.runs
      .find(
        { status: 'running' },
        { projection: { _id: 0, id: 1, orgId: 1, startedAt: 1 } },
      )
      .toArray()) as Array<{ id: string; orgId: string; startedAt?: string }>;

    const orphans = runningRuns.filter((r) => !activeIds.has(r.id));
    if (orphans.length === 0) {
      logger.info(
        { totalRunning: runningRuns.length, activeJobs: activeIds.size },
        'no orphaned runs to recover',
      );
      return;
    }

    const endedAt = new Date().toISOString();
    for (const r of orphans) {
      const wasCancelled =
        (await cancelRedis.get(cancelFlagKey(r.id as RunId))) === '1';
      const status = wasCancelled ? 'cancelled' : 'failed';
      const errorMessage = wasCancelled
        ? undefined
        : 'Worker restarted while run was active (orphaned). Retry the run.';

      await db.runs.updateOne(
        { id: r.id, status: 'running' },
        {
          $set: {
            status,
            endedAt,
            ...(errorMessage ? { errorMessage } : {}),
          },
        },
      );

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

      // Clear the cancel flag — the run is over.
      try {
        await cancelRedis.del(cancelFlagKey(r.id as RunId));
      } catch (err) {
        logger.warn({ err, runId: r.id }, 'failed to clear cancel flag');
      }
    }

    logger.warn(
      { recovered: orphans.length, runIds: orphans.map((o) => o.id) },
      'recovered orphaned runs from previous worker session',
    );
  } finally {
    await runsQueue.close();
    await previewsQueue.close();
  }
}
