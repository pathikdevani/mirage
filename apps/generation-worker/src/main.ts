import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import { env } from './env.js';
import { makeRunProcessor } from './processor.js';
import { PREVIEWS_QUEUE, RUNS_QUEUE, type RunJobData } from './queues.js';
import { connectDb } from './db.js';
import { shutdownSandbox } from './sandbox-singleton.js';
import { recoverOrphanedRuns } from './recover-orphans.js';

const logger = pino({ level: env.logLevel });

/**
 * Two BullMQ workers, each backed by its own Redis connection (BullMQ
 * requires `maxRetriesPerRequest: null` on consumer connections). A separate
 * publisher connection handles run-event fan-out; a separate cancelRedis
 * connection handles the cancel-flag polling.
 */
async function main(): Promise<void> {
  const consumerOpts = { maxRetriesPerRequest: null } as const;

  const runsConnection = new IORedis(env.redisUrl, consumerOpts);
  const previewsConnection = new IORedis(env.redisUrl, consumerOpts);
  const publisher = new IORedis(env.redisUrl);
  const cancelRedis = new IORedis(env.redisUrl);

  const db = await connectDb();

  // Recover any runs left at status='running' by a previous worker process
  // that died mid-execution (tsx watch restart, crash, SIGKILL). Must run
  // BEFORE the workers start consuming, so we don't accidentally fail a run
  // that another live worker is currently processing.
  try {
    await recoverOrphanedRuns({
      db,
      publisher,
      cancelRedis,
      bullConnection: runsConnection,
      logger,
    });
  } catch (err) {
    logger.warn({ err }, 'orphan recovery failed; continuing startup');
  }

  const processor = makeRunProcessor({ publisher, cancelRedis, db, logger });

  const runsWorker = new Worker<RunJobData>(
    RUNS_QUEUE,
    processor as (job: Job<RunJobData>) => Promise<unknown>,
    { connection: runsConnection, concurrency: env.runsConcurrency },
  );

  const previewsWorker = new Worker<RunJobData>(
    PREVIEWS_QUEUE,
    processor as (job: Job<RunJobData>) => Promise<unknown>,
    { connection: previewsConnection, concurrency: env.previewsConcurrency },
  );

  for (const w of [runsWorker, previewsWorker]) {
    w.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, queue: w.name, err: err.message }, 'job failed');
    });
    w.on('completed', (job) => {
      logger.info({ jobId: job.id, queue: w.name }, 'job completed');
    });
  }

  logger.info(
    {
      queues: [RUNS_QUEUE, PREVIEWS_QUEUE],
      runsConcurrency: env.runsConcurrency,
      previewsConcurrency: env.previewsConcurrency,
    },
    'generation-worker started',
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await Promise.all([runsWorker.close(), previewsWorker.close()]);
      await shutdownSandbox();
      await db.client.close();
      runsConnection.disconnect();
      previewsConnection.disconnect();
      publisher.disconnect();
      cancelRedis.disconnect();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'generation-worker failed to start');
  process.exit(1);
});

