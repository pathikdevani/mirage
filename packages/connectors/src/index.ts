/**
 * `@mirage/connectors` — connector contract + all built-in connectors.
 *
 * Per TECH_ARCHITECHRE.md §3.5 every connector is first-party code. This
 * package is consumed by the export service exclusively; the SPA only reads
 * the registry's metadata (id / displayName / configSchema) over REST.
 *
 * Today the JSON connector is real; the other seven (CSV, Excel, ZIP, Mongo,
 * Postgres, Elasticsearch, Webhook) are stubs that satisfy the contract and
 * throw `ConnectorNotImplementedError` on `open`. Bootstrap-time decision:
 * one workspace package with per-connector folders rather than nine
 * sub-packages — refactor to sub-packages later if independent versioning
 * is needed.
 */

export * from './types.js';
export * from './errors.js';
export * from './registry.js';
export * from './built-in.js';

export { jsonConnector } from './json/index.js';
export { csvConnector } from './csv/index.js';
export { excelConnector } from './excel/index.js';
export { zipConnector } from './zip/index.js';
export { mongoConnector } from './mongo/index.js';
export { postgresConnector } from './postgres/index.js';
export { elasticsearchConnector } from './elasticsearch/index.js';
export { webhookConnector } from './webhook/index.js';
