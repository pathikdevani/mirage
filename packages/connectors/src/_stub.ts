import { ConnectorNotImplementedError } from './errors.js';
import type { Connector } from './types.js';

/**
 * Build a placeholder connector that satisfies the contract but throws on
 * `open`. Used by the seven connectors still to be implemented so the
 * registry surface and the SPA's connector-picker can be wired today.
 */
export function buildStubConnector(args: {
  id: string;
  displayName: string;
}): Connector<Record<string, unknown>> {
  return {
    id: args.id,
    displayName: args.displayName,
    configSchema: { type: 'object', additionalProperties: true },
    async validateConfig(cfg: unknown): Promise<Record<string, unknown>> {
      return (cfg && typeof cfg === 'object' ? cfg : {}) as Record<string, unknown>;
    },
    async open(): Promise<never> {
      throw new ConnectorNotImplementedError(args.id);
    },
  };
}
