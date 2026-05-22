import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

/**
 * The BFF is the SPA's single ingress (TECH_ARCHITECHRE.md §3.2). Workspace
 * routes are owned by `workspace-svc`; the BFF forwards them through. This
 * keeps a clean separation today without coupling the SPA to internal
 * service URLs.
 *
 * Forwarding rules:
 * - Carry the Authorization header so workspace-svc independently verifies the JWT.
 * - Carry X-Mirage-Org so workspace-svc enforces tenant scoping.
 * - Don't touch the body — JSON in, JSON out.
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

export function registerWorkspaceProxyRoutes(app: FastifyInstance): void {
  app.get('/workspaces', (req, reply) => forward(req, reply, '/workspaces'));
  app.post('/workspaces', (req, reply) => forward(req, reply, '/workspaces'));
  app.get<{ Params: { id: string } }>('/workspaces/:id', (req, reply) =>
    forward(req, reply, `/workspaces/${encodeURIComponent(req.params.id)}`),
  );
  app.delete<{ Params: { id: string } }>('/workspaces/:id', (req, reply) =>
    forward(req, reply, `/workspaces/${encodeURIComponent(req.params.id)}`),
  );
}
