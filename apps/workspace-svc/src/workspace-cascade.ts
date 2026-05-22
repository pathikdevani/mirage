import type { FastifyBaseLogger } from 'fastify';
import type { WorkspaceId } from '@mirage/types';

/**
 * Ports the cascade calls. Real implementations live in workspace-svc/server.ts;
 * tests inject in-memory fakes.
 */
export interface CascadePorts {
  /** Count of runs in non-terminal states (`queued`, `running`, `cancelling`). */
  countActiveRuns(workspaceId: WorkspaceId): Promise<number>;
  /** Delete every S3 object under `org/{orgId}/workspace/{wsId}/`. Idempotent. */
  purgeS3Prefix(orgId: string, workspaceId: WorkspaceId): Promise<void>;
  /** Run `deleteMany` against each workspace-scoped collection, in dependency order. */
  purgeMongo(workspaceId: WorkspaceId): Promise<void>;
  /** Look up `(orgId, deletedAt)` for a soft-deleted workspace, or null if gone. */
  lookupSoftDeleted(
    workspaceId: WorkspaceId,
  ): Promise<{ orgId: string } | null>;
  /** Find every workspace currently in `deletedAt` state. Used by the startup sweep. */
  listSoftDeleted(): Promise<WorkspaceId[]>;
}

export interface CascadeOptions {
  /** Max wall-clock seconds to wait for runs to drain. Default 120. */
  drainTimeoutSec?: number;
  /** Poll interval (ms) while waiting for runs to drain. Default 1000. */
  drainPollMs?: number;
  log: FastifyBaseLogger;
  ports: CascadePorts;
}

export interface WorkspaceCascade {
  enqueue(workspaceId: WorkspaceId): void;
  runStartupSweep(): Promise<void>;
  /** Test hook — resolves after every in-flight cascade has finished. */
  waitIdle(): Promise<void>;
}

export function createWorkspaceCascade(opts: CascadeOptions): WorkspaceCascade {
  const drainTimeoutMs = (opts.drainTimeoutSec ?? 120) * 1000;
  const pollMs = opts.drainPollMs ?? 1000;
  const log = opts.log;
  const ports = opts.ports;

  const inflight = new Map<WorkspaceId, Promise<void>>();

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const drain = async (workspaceId: WorkspaceId): Promise<void> => {
    const deadline = Date.now() + drainTimeoutMs;
    while (Date.now() < deadline) {
      const n = await ports.countActiveRuns(workspaceId);
      if (n === 0) return;
      log.info({ workspaceId, active: n }, 'workspace-cascade: waiting for runs to drain');
      await sleep(pollMs);
    }
    log.warn({ workspaceId }, 'workspace-cascade: drain timeout, proceeding regardless');
  };

  const cascade = async (workspaceId: WorkspaceId): Promise<void> => {
    log.info({ workspaceId }, 'workspace-cascade: starting');
    const found = await ports.lookupSoftDeleted(workspaceId);
    if (!found) {
      log.info({ workspaceId }, 'workspace-cascade: nothing to do (already gone)');
      return;
    }
    await drain(workspaceId);
    log.info({ workspaceId }, 'workspace-cascade: purging S3');
    await ports.purgeS3Prefix(found.orgId, workspaceId);
    log.info({ workspaceId }, 'workspace-cascade: purging Mongo');
    await ports.purgeMongo(workspaceId);
    log.info({ workspaceId }, 'workspace-cascade: done');
  };

  const enqueue = (workspaceId: WorkspaceId): void => {
    if (inflight.has(workspaceId)) return;
    const p = cascade(workspaceId)
      .catch((err: unknown) => {
        log.error({ err, workspaceId }, 'workspace-cascade: failed');
      })
      .finally(() => {
        inflight.delete(workspaceId);
      });
    inflight.set(workspaceId, p);
  };

  const runStartupSweep = async (): Promise<void> => {
    const ids = await ports.listSoftDeleted();
    log.info({ count: ids.length }, 'workspace-cascade: startup sweep');
    for (const id of ids) enqueue(id);
  };

  const waitIdle = async (): Promise<void> => {
    while (inflight.size > 0) {
      await Promise.allSettled([...inflight.values()]);
    }
  };

  return { enqueue, runStartupSweep, waitIdle };
}
