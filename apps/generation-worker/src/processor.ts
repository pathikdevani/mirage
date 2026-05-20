import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import { runSet } from '@mirage/engine';
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

class CancelledError extends Error {
  override readonly name = 'CancelledError';
}

/**
 * BullMQ job handler. Loads the Set/Schemas/Functions, runs the engine,
 * streams NDJSON to S3, and publishes `run.*` events to Redis pub/sub.
 *
 * Cancellation is cooperative: the worker polls `cancelFlagKey(runId)` between
 * schemas and on entry. On cancel/failure the multipart upload is aborted so
 * no partial artifact is left in object storage.
 *
 * The processor does NOT rethrow — BullMQ retry isn't in v1 scope (failed
 * runs require a manual re-click per the spec's Out of scope list).
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

    try {
      if (await isCancelled(cancelRedis, runId)) throw new CancelledError();

      const { set, schemas, registry } = await loadRunInputs({ db, workspaceId, setId });
      const sandbox = getSandbox();

      const result = await runSet({ set, schemas, customFunctions: registry, sandbox });

      writer = new RunArtifactWriter({
        orgId,
        workspaceId,
        runId,
        s3Client: s3,
        bucket: env.s3.bucket,
      });

      const totalRows = set.schemas.reduce((acc, inc) => acc + inc.count, 0);
      let produced = 0;
      const rowCounts: Record<string, number> = {};

      for (const [schemaKey, rows] of result.rowsByKey.entries()) {
        if (await isCancelled(cancelRedis, runId)) throw new CancelledError();
        for (const row of rows) {
          await writer.writeRow({ __schemaKey: schemaKey, ...(row as object) });
        }
        produced += rows.length;
        rowCounts[schemaKey] = rows.length;
        const progress: RunProgressEvent = {
          type: 'run.progress',
          runId,
          schemaId: schemaKey as SchemaId,
          produced,
          total: totalRows,
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
    }
  };
}
