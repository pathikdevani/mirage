import type { FastifyInstance } from 'fastify';
import { createDefaultRegistry, type ConnectorRow, type Sink } from '@mirage/connectors';
import { asId, type RunId, type WorkspaceId } from '@mirage/types';
import { fetchRunArtifact, RunArtifactNotFoundError } from '../storage.js';

const registry = createDefaultRegistry();

interface ExportBody {
  connectorId: string;
  config: unknown;
  /** Workspace the run belongs to — required to construct the artifact key. */
  workspaceId: string;
}

interface ExportParams {
  id: string;
}

export function registerExportRoutes(app: FastifyInstance): void {
  app.get('/connectors', { config: { public: true } }, async () => ({
    connectors: registry.list().map((c) => ({
      id: c.id,
      displayName: c.displayName,
      configSchema: c.configSchema,
    })),
  }));

  app.post<{ Body: ExportBody; Params: ExportParams }>(
    '/runs/:id/export',
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) return reply.code(401).send({ error: 'unauthenticated' });

      const { connectorId, config, workspaceId } = request.body ?? ({} as ExportBody);
      if (!connectorId || !workspaceId) {
        return reply.code(400).send({ error: 'connectorId and workspaceId are required' });
      }

      const connector = registry.get(connectorId);
      if (!connector) {
        return reply.code(404).send({ error: `unknown connector: ${connectorId}` });
      }

      let validCfg: unknown;
      try {
        validCfg = await connector.validateConfig(config);
      } catch (err) {
        return reply.code(400).send({
          error: 'invalid connector config',
          detail: err instanceof Error ? err.message : String(err),
        });
      }

      // Open the connector pointing at the raw HTTP response stream so the
      // export streams straight to the client without a buffer.
      reply.raw.setHeader('content-type', 'application/octet-stream');
      reply.raw.setHeader(
        'content-disposition',
        `attachment; filename="run-${request.params.id}-${connectorId}.out"`,
      );

      let sink: Sink;
      try {
        sink = await connector.open(validCfg, {
          orgId: auth.orgId,
          workspaceId: asId<WorkspaceId>(workspaceId),
          runId: asId<RunId>(request.params.id),
          schemaIds: [],
          attachments: { target: reply.raw },
        });
      } catch (err) {
        return reply.code(500).send({
          error: 'connector failed to open',
          detail: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        const artifact = await fetchRunArtifact({
          orgId: auth.orgId,
          workspaceId: asId<WorkspaceId>(workspaceId),
          runId: asId<RunId>(request.params.id),
        });
        await streamNdjsonThroughSink(artifact.body, sink);
        await sink.close();
        reply.raw.end();
        return reply;
      } catch (err) {
        // The headers may already be flushed — best we can do is end the
        // response and log. Reply object short-circuits if it's been sent.
        if (err instanceof RunArtifactNotFoundError) {
          if (!reply.sent) {
            return reply.code(404).send({ error: err.message });
          }
        }
        request.log.error({ err }, 'export failed mid-stream');
        if (!reply.sent) {
          return reply.code(500).send({ error: 'export failed', detail: (err as Error).message });
        }
        reply.raw.end();
        return reply;
      }
    },
  );
}

/**
 * Stream NDJSON from the storage body line-by-line, parse each row, and hand
 * it to the connector's sink. Backpressure flows through `sink.write`'s
 * `await` — connectors that wrap a Writable will block here when the
 * downstream is full.
 */
async function streamNdjsonThroughSink(body: NodeJS.ReadableStream, sink: Sink): Promise<void> {
  let buffer = '';
  for await (const chunk of body) {
    buffer += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.length === 0) continue;
      const row = JSON.parse(line) as ConnectorRow;
      if (typeof row.__schemaId !== 'string' || typeof row.__id !== 'string') {
        throw new Error('artifact row missing __schemaId/__id metadata');
      }
      await sink.write(row);
    }
  }
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    const row = JSON.parse(trailing) as ConnectorRow;
    await sink.write(row);
  }
}
