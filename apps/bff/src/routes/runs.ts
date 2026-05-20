import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

async function forward(
  request: FastifyRequest,
  reply: FastifyReply,
  targetPath: string,
): Promise<void> {
  const url = `${env.workspaceSvcUrl}${targetPath}`;
  const headers: Record<string, string> = {};
  if (request.headers.authorization) headers['authorization'] = request.headers.authorization;
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

const enc = encodeURIComponent;

export function registerRunProxyRoutes(app: FastifyInstance): void {
  app.post<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/sets/:id/run',
    (req, reply) =>
      forward(
        req,
        reply,
        `/workspaces/${enc(req.params.wsId)}/sets/${enc(req.params.id)}/run`,
      ),
  );
  app.post<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/runs/:id/cancel',
    (req, reply) =>
      forward(
        req,
        reply,
        `/workspaces/${enc(req.params.wsId)}/runs/${enc(req.params.id)}/cancel`,
      ),
  );
  app.get<{ Params: { wsId: string } }>('/workspaces/:wsId/runs', (req, reply) => {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return forward(req, reply, `/workspaces/${enc(req.params.wsId)}/runs${qs}`);
  });
  app.get<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/runs/:id',
    (req, reply) =>
      forward(
        req,
        reply,
        `/workspaces/${enc(req.params.wsId)}/runs/${enc(req.params.id)}`,
      ),
  );
  app.get<{ Params: { wsId: string; id: string } }>(
    '/workspaces/:wsId/runs/:id/preview',
    (req, reply) => {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return forward(
        req,
        reply,
        `/workspaces/${enc(req.params.wsId)}/runs/${enc(req.params.id)}/preview${qs}`,
      );
    },
  );
}
