import type { OrgId, WorkspaceId, RunId, SchemaId } from '@mirage/types';

/**
 * Connector contract (TECH_ARCHITECHRE.md §3.5).
 *
 * Connectors are first-party code shipped with the export service. No
 * runtime plugin install, no per-org enablement, no sandboxing. Adding a
 * connector is a code change + release.
 *
 * Rows flow: object storage → export-svc → `sink.write(row)` → `sink.close()`.
 */

// Minimal JSON Schema typing. We don't want a full JSON Schema lib as a dep
// at this layer — the UI consumes the `configSchema` for form rendering and
// validation happens via `validateConfig`.
export type ConnectorConfigSchema = Record<string, unknown>;

/**
 * Open-context handed to `connector.open`. The export service decides what
 * the connector writes *to* (an HTTP response stream, an object-storage
 * upload, a database connection). Connectors that need a specific shape ask
 * for it in their typed `config`.
 */
export interface ConnectorOpenContext {
  orgId: OrgId;
  workspaceId: WorkspaceId;
  runId: RunId;
  /** Row schemas present in the run, in case a connector needs per-schema target naming. */
  schemaIds: ReadonlyArray<SchemaId>;
  /** Free-form bag for service-injected handles (e.g. a Node `Writable`). */
  attachments?: Record<string, unknown>;
}

/** Single row produced by the engine. Shape mirrors `engine.ResolvedRow`. */
export interface ConnectorRow {
  readonly __schemaId: SchemaId;
  readonly __id: string;
  readonly [field: string]: unknown;
}

/**
 * A streaming write target opened by a Connector. Sinks must back-pressure;
 * `write` is awaited per row so connectors can pause the upstream stream.
 */
export interface Sink {
  write(row: ConnectorRow): Promise<void>;
  close(): Promise<void>;
}

/**
 * A Connector definition. Registered at service startup via the registry.
 * `Cfg` is the type of the connector's validated config — keep it narrow.
 */
export interface Connector<Cfg = unknown> {
  /** Stable id, e.g. `"json"`, `"mongo"`. Persisted in `connectors` collection rows. */
  id: string;
  /** Human-facing display name. */
  displayName: string;
  /** JSON-Schema describing the config — used by the SPA to render the form. */
  configSchema: ConnectorConfigSchema;
  /** Throws if `cfg` doesn't pass connector-specific rules beyond raw schema shape. */
  validateConfig(cfg: unknown): Promise<Cfg>;
  /** Open a streaming Sink. The caller is responsible for `close()`. */
  open(cfg: Cfg, ctx: ConnectorOpenContext): Promise<Sink>;
}
