import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import { planRunSet, runSetStream, CancelledError } from '@mirage/engine';
import type {
  RunCancelledEvent,
  RunCompletedEvent,
  RunEvent,
  RunFailedEvent,
  RunProgressEvent,
  RunStartedEvent,
  SchemaId,
} from '@mirage/types';
import { runChannel, type RunJobData } from './queues.js';
import type { WorkerDb } from './db.js';
import { loadRunInputs, LoadFailure } from './loaders.js';
import { getSandbox } from './sandbox-singleton.js';
import { isCancelled } from './cancel.js';
import { RunArtifactWriter } from './artifact-writer.js';
import { s3 } from './s3.js';
import { env } from './env.js';

const nowIso = (): string => new Date().toISOString();

const CANCEL_POLL_MS = 250;

/**
 * BullMQ job handler. Loads the Set/Schemas/Functions, drives the streaming
 * engine, writes NDJSON to S3 in batches, and publishes `run.*` events to
 * Redis pub/sub.
 *
 * Cancellation: a 250 ms-tick poller checks `cancelFlagKey(runId)` and aborts
 * the engine via AbortSignal on cancel. The engine throws CancelledError at
 * the next batch boundary; the multipart upload is aborted so no partial
 * artifact is left in object storage.
 *
 * The processor does NOT rethrow — BullMQ retry isn't in v1 scope.
 */
export function makeRunProcessor(args: {
  publisher: Redis;
  cancelRedis: Redis;
  db: WorkerDb;
  logger: Logger;
}): (job: Job<RunJobData>) => Promise<void> {
  const { publisher, cancelRedis, db, logger } = args;

  const publish = async (event: RunEvent, orgId: RunJobData['orgId']): Promise<void> => {
    await publisher.publish(runChannel(orgId, event.runId), JSON.stringify(event));
  };

  return async (job: Job<RunJobData>): Promise<void> => {
    const { runId, setId, orgId, workspaceId } = job.data;
    const log = logger.child({ runId, setId });

    const startedAt = nowIso();
    await db.runs.updateOne({ id: runId }, { $set: { status: 'running', startedAt } });
    const startedEvent: RunStartedEvent = { type: 'run.started', runId, setId, at: startedAt };
    await publish(startedEvent, orgId);
    log.info('run started');

    let writer: RunArtifactWriter | null = null;
    const cancelController = new AbortController();
    const cancelTimer = setInterval(() => {
      void isCancelled(cancelRedis, runId).then((c) => {
        if (c) cancelController.abort();
      });
    }, CANCEL_POLL_MS);

    try {
      if (await isCancelled(cancelRedis, runId)) throw new CancelledError();

      const { set, schemas, registry } = await loadRunInputs({ db, workspaceId, setId });
      const sandbox = getSandbox();
      const plan = planRunSet({ set, schemas });

      await publish(
        {
          type: 'run.progress',
          runId,
          schemaId: (plan.order[0] ?? '') as SchemaId,
          produced: 0,
          total: plan.totalRows,
          at: nowIso(),
        } satisfies RunProgressEvent,
        orgId,
      );

      writer = new RunArtifactWriter({
        orgId,
        workspaceId,
        runId,
        s3Client: s3,
        bucket: env.s3.bucket,
      });

      const rowCounts: Record<string, number> = {};

      for await (const batch of runSetStream({
        set,
        schemas,
        customFunctions: registry,
        sandbox,
        batchSize: env.generation.batchSize,
        signal: cancelController.signal,
      })) {
        for (const row of batch.rows) {
          await writer.writeRow({ __schemaKey: batch.schemaKey, ...(row as object) });
        }
        rowCounts[batch.schemaKey] = batch.schemaProduced;
        const progress: RunProgressEvent = {
          type: 'run.progress',
          runId,
          schemaId: batch.schemaKey as SchemaId,
          produced: batch.totalProduced,
          total: batch.totalRows,
          at: nowIso(),
        };
        await publish(progress, orgId);
      }

      await writer.close();

      const endedAt = nowIso();
      await db.runs.updateOne(
        { id: runId },
        { $set: { status: 'completed', endedAt, artifactKey: writer.key, rowCounts } },
      );
      const completed: RunCompletedEvent = {
        type: 'run.completed',
        runId,
        artifactKey: writer.key,
        rowCounts: rowCounts as Partial<Record<SchemaId, number>>,
        at: endedAt,
      };
      await publish(completed, orgId);
      log.info({ rowCounts }, 'run completed');
    } catch (err) {
      const endedAt = nowIso();
      if (err instanceof CancelledError) {
        if (writer) await writer.abort();
        await db.runs.updateOne({ id: runId }, { $set: { status: 'cancelled', endedAt } });
        const cancelled: RunCancelledEvent = { type: 'run.cancelled', runId, at: endedAt };
        await publish(cancelled, orgId);
        log.info('run cancelled');
        return;
      }
      if (writer) {
        try {
          await writer.abort();
        } catch (abortErr) {
          log.warn({ err: abortErr }, 'failed to abort upload');
        }
      }
      const message =
        err instanceof LoadFailure
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      await db.runs.updateOne(
        { id: runId },
        { $set: { status: 'failed', endedAt, errorMessage: message } },
      );
      const failed: RunFailedEvent = { type: 'run.failed', runId, message, at: endedAt };
      await publish(failed, orgId);
      log.warn({ err }, 'run failed');
    } finally {
      clearInterval(cancelTimer);
    }
  };
}
