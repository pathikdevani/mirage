import type { OrgId, RunId, RunKind, SetId, UserId, WorkspaceId } from '@mirage/types';

/**
 * Two-queue topology per TECH_ARCHITECHRE.md §3.4:
 * - `runs` for full Set executions (heavyweight, low concurrency).
 * - `previews` for editor-driven 5-10 row previews (fast-lane, higher concurrency).
 */
export const RUNS_QUEUE = 'mirage-runs' as const;
export const PREVIEWS_QUEUE = 'mirage-previews' as const;

/**
 * Payload enqueued by the BFF when the SPA hits `POST /sets/:id/run`. The
 * worker is responsible for emitting `run.*` events to the pub/sub channel
 * `org:{orgId}:run:{runId}`; the BFF fans those out to subscribed WS clients.
 */
export interface RunJobData {
  runId: RunId;
  setId: SetId;
  orgId: OrgId;
  workspaceId: WorkspaceId;
  requestedBy: UserId;
  kind: RunKind;
}

/** Redis pub/sub channel name for run progress events. */
export const runChannel = (orgId: OrgId, runId: RunId): string => `org:${orgId}:run:${runId}`;

/** Redis key the BFF flips to signal cancellation; the worker polls it between batches. */
export const cancelFlagKey = (runId: RunId): string => `run:${runId}:cancel`;
