import type { Writable } from 'node:stream';
import { ConnectorConfigError, ConnectorOpenError } from '../errors.js';
import type { Connector, ConnectorOpenContext, ConnectorRow, Sink } from '../types.js';

/**
 * JSON connector — streams rows as a single JSON array to a Writable supplied
 * by the export service. Backpressure flows through: each `write` awaits
 * `Writable.write`'s drain signal when needed.
 *
 * Config: `{ pretty?: boolean }` — toggles 2-space indentation.
 * Attachment: `attachments.target: Writable` — required.
 */

export interface JsonConnectorConfig {
  pretty?: boolean;
}

export interface JsonConnectorAttachments {
  target: Writable;
}

const writeAsync = (target: Writable, chunk: string): Promise<void> =>
  new Promise((resolve, reject) => {
    target.write(chunk, 'utf8', (err) => (err ? reject(err) : resolve()));
  });

export const jsonConnector: Connector<JsonConnectorConfig> = {
  id: 'json',
  displayName: 'JSON file',
  configSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      pretty: { type: 'boolean', default: false },
    },
  },

  async validateConfig(cfg: unknown): Promise<JsonConnectorConfig> {
    if (cfg === null || typeof cfg !== 'object') {
      throw new ConnectorConfigError('json: config must be an object');
    }
    const obj = cfg as Record<string, unknown>;
    if ('pretty' in obj && typeof obj['pretty'] !== 'boolean') {
      throw new ConnectorConfigError('json: `pretty` must be a boolean');
    }
    return { pretty: Boolean(obj['pretty']) };
  },

  async open(cfg: JsonConnectorConfig, ctx: ConnectorOpenContext): Promise<Sink> {
    const target = (ctx.attachments?.['target'] ?? undefined) as Writable | undefined;
    if (!target || typeof target.write !== 'function') {
      throw new ConnectorOpenError(
        'json: missing or invalid `attachments.target` (expected a Node Writable)',
      );
    }

    const indent = cfg.pretty ? 2 : 0;
    let first = true;
    await writeAsync(target, '[');

    return {
      async write(row: ConnectorRow): Promise<void> {
        const prefix = first ? '\n' : ',\n';
        first = false;
        const body = JSON.stringify(row, null, indent);
        await writeAsync(target, prefix + body);
      },
      async close(): Promise<void> {
        await writeAsync(target, first ? ']' : '\n]');
      },
    };
  },
};
