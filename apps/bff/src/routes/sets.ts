import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

/**
 * Mirrors the `/workspaces/:wsId/sets` routes from `workspace-svc`.
 * Same forwarding pattern as `schemas.ts` — preserve auth + tenant headers,
 * JSON in / JSON out.
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

export function registerSetProxyRoutes(app: FastifyInstance): void {
  app.get<{ Params: { wsId: string } }>('/workspaces/:wsId/sets', (req, reply) =>
    forward(req, reply, `/workspaces/${encodeURIComponent(req.params.wsId)}/sets`),
  );
  app.post<{ Params: { wsId: string } }>('/workspaces/:wsId/sets', (req, reply) =>
    forward(req, reply, `/workspaces/${encodeURIComponent(req.params.wsId)}/sets`),
  );
  app.get<{ Params: { wsId: string; id: string } }>('/workspaces/:wsId/sets/:id', (req, reply) =>
    forward(
      req,
      reply,
      `/workspaces/${encodeURIComponent(req.params.wsId)}/sets/${encodeURIComponent(req.params.id)}`,
    ),
  );
  app.put<{ Params: { wsId: string; id: string } }>('/workspaces/:wsId/sets/:id', (req, reply) =>
    forward(
      req,
      reply,
      `/workspaces/${encodeURIComponent(req.params.wsId)}/sets/${encodeURIComponent(req.params.id)}`,
    ),
  );
  app.delete<{ Params: { wsId: string; id: string } }>('/workspaces/:wsId/sets/:id', (req, reply) =>
    forward(
      req,
      reply,
      `/workspaces/${encodeURIComponent(req.params.wsId)}/sets/${encodeURIComponent(req.params.id)}`,
    ),
  );
  app.get<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/sets/:id/edges',
    (req, reply) =>
      forward(
        req,
        reply,
        `/workspaces/${encodeURIComponent(req.params.wsId)}/sets/${encodeURIComponent(req.params.id)}/edges`,
      ),
  );
}
