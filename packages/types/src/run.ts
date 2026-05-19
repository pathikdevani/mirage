import type { OrgId, RunId, SchemaId, SetId, UserId, WorkspaceId } from './branded.js';

/**
 * Run vocabulary. A Run is the act of executing a Set to produce rows. Rows
 * are not persisted as a first-class entity, but the *artifact* (NDJSON of
 * the most-recent Run per Set) is cached in object storage. Older artifacts
 * are evicted. See CONTEXT.md and TECH_ARCHITECHRE.md §4.
 */

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type RunKind = 'full' | 'preview';

export interface Run {
  id: RunId;
  orgId: OrgId;
  workspaceId: WorkspaceId;
  setId: SetId;
  kind: RunKind;
  status: RunStatus;
  /** Object-storage key, set once an artifact has been written. */
  artifactKey?: string;
  /** Per-Schema row totals once known. */
  rowCounts?: Partial<Record<SchemaId, number>>;
  startedAt?: string;
  endedAt?: string;
  /** Surfaced when status === 'failed'. */
  errorMessage?: string;
  requestedBy: UserId;
  createdAt: string;
}

// ---------- Run progress events (Redis pub/sub → WS) ----------

export interface RunStartedEvent {
  type: 'run.started';
  runId: RunId;
  setId: SetId;
  at: string;
}

export interface RunProgressEvent {
  type: 'run.progress';
  runId: RunId;
  schemaId: SchemaId;
  produced: number;
  total: number;
  at: string;
}

export interface RunCompletedEvent {
  type: 'run.completed';
  runId: RunId;
  artifactKey: string;
  rowCounts: Partial<Record<SchemaId, number>>;
  at: string;
}

export interface RunFailedEvent {
  type: 'run.failed';
  runId: RunId;
  message: string;
  at: string;
}

export interface RunCancelledEvent {
  type: 'run.cancelled';
  runId: RunId;
  at: string;
}

export type RunEvent =
  | RunStartedEvent
  | RunProgressEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunCancelledEvent;
