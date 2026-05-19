import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import type { RunCompletedEvent, RunEvent, RunFailedEvent, RunStartedEvent } from '@mirage/types';
import { runChannel, type RunJobData } from './queues.js';

const nowIso = (): string => new Date().toISOString();

/**
 * Build a BullMQ job handler. The handler is closed over the Redis publisher
 * + logger so the queue layer stays unaware of either.
 *
 * Today it emits `run.started` then immediately `run.failed` with a
 * "not implemented" message — wiring is real, the engine call inside is the
 * piece still to land (engine's `resolveSchema` throws `NotImplementedError`).
 * Once the engine + Mongo loader + S3 sink come online, the body of the
 * `try` block expands to: load Set+Schemas → resolveSchema → applyStrategy
 * → stream NDJSON to object storage → publish `run.progress` between batches.
 */
export function makeRunProcessor(args: {
  publisher: Redis;
  logger: Logger;
}): (job: Job<RunJobData>) => Promise<RunCompletedEvent> {
  const { publisher, logger } = args;

  const publish = async (event: RunEvent, orgId: RunJobData['orgId']): Promise<void> => {
    await publisher.publish(runChannel(orgId, event.runId), JSON.stringify(event));
  };

  return async (job: Job<RunJobData>): Promise<RunCompletedEvent> => {
    const { runId, setId, orgId, kind } = job.data;
    const log = logger.child({ runId, setId, kind });

    const startedEvent: RunStartedEvent = {
      type: 'run.started',
      runId,
      setId,
      at: nowIso(),
    };
    await publish(startedEvent, orgId);
    log.info('run started');

    try {
      // TODO(post-bootstrap): load Set + Schemas + CustomFunctions from Mongo,
      // build a CustomFunctionRegistry, call engine.resolveSchema for every
      // Schema in the Set, apply Strategies, stream rows as NDJSON to S3,
      // poll cancelFlagKey between batches.
      throw new Error(`Full run pipeline not yet implemented (engine.resolveSchema is a stub).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed: RunFailedEvent = {
        type: 'run.failed',
        runId,
        message,
        at: nowIso(),
      };
      await publish(failed, orgId);
      log.warn({ err }, 'run failed');
      throw err;
    }
  };
}
