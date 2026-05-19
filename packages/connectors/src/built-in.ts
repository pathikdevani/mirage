import { csvConnector } from './csv/index.js';
import { elasticsearchConnector } from './elasticsearch/index.js';
import { excelConnector } from './excel/index.js';
import { jsonConnector } from './json/index.js';
import { mongoConnector } from './mongo/index.js';
import { postgresConnector } from './postgres/index.js';
import { ConnectorRegistry } from './registry.js';
import type { Connector } from './types.js';
import { webhookConnector } from './webhook/index.js';
import { zipConnector } from './zip/index.js';

/**
 * Every connector shipped with Mirage today. The export service builds its
 * registry from this list at startup. Adding a connector = append here.
 */
export const builtInConnectors: ReadonlyArray<Connector<unknown>> = [
  jsonConnector as Connector<unknown>,
  csvConnector,
  excelConnector,
  zipConnector,
  mongoConnector,
  postgresConnector,
  elasticsearchConnector,
  webhookConnector,
];

/** Convenience: returns a fresh registry pre-populated with built-ins. */
export function createDefaultRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistry();
  for (const c of builtInConnectors) {
    registry.register(c);
  }
  return registry;
}
