import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

/**
 * Mirrors the `/workspaces/:wsId/schemas` routes from `workspace-svc`.
 * Same forwarding pattern as `workspaces.ts` — preserve auth + tenant
 * headers, JSON in / JSON out.
 */
async function forward(
  request: FastifyRequest,
  reply: FastifyReply,
  targetPath: string,
): Promise<void> {
  const url = `${env.workspaceSvcUrl}${targetPath}`;
  const headers: Record<string, string> = {};
  if (request.headers.authorization) {
    headers['authorization'] = request.headers.authorization;
  }
  const orgHeader = request.headers['x-mirage-org'];
  if (typeof orgHeader === 'string') headers['x-mirage-org'] = orgHeader;
  if (request.headers['content-type']) {
    headers['content-type'] = String(request.headers['content-type']);
  }

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    init.body = JSON.stringify(request.body);
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    request.log.error({ err, url }, 'workspace-svc unreachable');
    return reply.code(502).send({ error: 'workspace-svc unreachable' });
  }
  const text = await upstream.text();
  reply.code(upstream.status);
  const ct = upstream.headers.get('content-type');
  if (ct) reply.header('content-type', ct);
  return reply.send(text);
}

export function registerSchemaProxyRoutes(app: FastifyInstance): void {
  app.get<{ Params: { wsId: string }; Querystring: { key?: string } }>(
    '/workspaces/:wsId/schemas',
    (req, reply) => {
      const keyQuery = req.query['key'];
      const qs =
        typeof keyQuery === 'string' && keyQuery.length > 0
          ? `?key=${encodeURIComponent(keyQuery)}`
          : '';
      return forward(req, reply, `/workspaces/${encodeURIComponent(req.params.wsId)}/schemas${qs}`);
    },
  );
  app.post<{ Params: { wsId: string } }>('/workspaces/:wsId/schemas', (req, reply) =>
    forward(req, reply, `/workspaces/${encodeURIComponent(req.params.wsId)}/schemas`),
  );
  app.post<{ Params: { wsId: string }; Querystring: { count?: string } }>(
    '/workspaces/:wsId/schemas/dry-run',
    (req, reply) => {
      const count = req.query['count'];
      const qs = typeof count === 'string' && count.length > 0
        ? `?count=${encodeURIComponent(count)}`
        : '';
      return forward(
        req,
        reply,
        `/workspaces/${encodeURIComponent(req.params.wsId)}/schemas/dry-run${qs}`,
      );
    },
  );
  app.get<{ Params: { wsId: string; id: string } }>('/workspaces/:wsId/schemas/:id', (req, reply) =>
    forward(
      req,
      reply,
      `/workspaces/${encodeURIComponent(req.params.wsId)}/schemas/${encodeURIComponent(req.params.id)}`,
    ),
  );
  app.put<{ Params: { wsId: string; id: string } }>('/workspaces/:wsId/schemas/:id', (req, reply) =>
    forward(
      req,
      reply,
      `/workspaces/${encodeURIComponent(req.params.wsId)}/schemas/${encodeURIComponent(req.params.id)}`,
    ),
  );
  app.delete<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/schemas/:id',
    (req, reply) =>
      forward(
        req,
        reply,
        `/workspaces/${encodeURIComponent(req.params.wsId)}/schemas/${encodeURIComponent(req.params.id)}`,
      ),
  );
}
