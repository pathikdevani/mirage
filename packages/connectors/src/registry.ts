import type { Connector } from './types.js';

/**
 * In-process registry of all connectors known to the export service. Wired
 * at service startup; lookups happen per export request. Throws on duplicate
 * id registration to catch wiring mistakes early.
 */
export class ConnectorRegistry {
  private readonly byId = new Map<string, Connector<unknown>>();

  register<C>(connector: Connector<C>): void {
    if (this.byId.has(connector.id)) {
      throw new Error(`Connector "${connector.id}" already registered`);
    }
    this.byId.set(connector.id, connector as Connector<unknown>);
  }

  get(id: string): Connector<unknown> | undefined {
    return this.byId.get(id);
  }

  /** All registered connectors, sorted by id for stable UI listings. */
  list(): Connector<unknown>[] {
    return [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }
}
