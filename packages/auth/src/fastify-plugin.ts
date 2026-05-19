import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { AuthContext } from '@mirage/types';
import {
  createKeycloakVerifier,
  JwtVerificationError,
  type KeycloakVerifierOptions,
} from './jwt.js';
import { resolveAuthContext, TenancyError, type MembershipResolver } from './tenancy.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `mirageAuthPlugin`. Absent on routes marked `{ config: { public: true } }`. */
    auth?: AuthContext;
  }

  interface FastifyContextConfig {
    /** When `true`, skip auth for this route (e.g. `/health`). */
    public?: boolean;
  }
}

export interface MirageAuthPluginOptions extends KeycloakVerifierOptions {
  resolveMembership: MembershipResolver;
}

const HEADER_ORG = 'x-mirage-org';

const plugin: FastifyPluginAsync<MirageAuthPluginOptions> = async (app, options) => {
  const verify = createKeycloakVerifier(options);

  app.addHook('preHandler', async (request: FastifyRequest, reply) => {
    if (request.routeOptions.config?.public) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing bearer token' });
    }
    const token = authHeader.slice('Bearer '.length).trim();

    try {
      const claims = await verify(token);
      const orgHeader = request.headers[HEADER_ORG];
      request.auth = await resolveAuthContext({
        claims,
        requestedOrgId: typeof orgHeader === 'string' ? orgHeader : orgHeader?.[0],
        resolveMembership: options.resolveMembership,
      });
    } catch (err) {
      if (err instanceof JwtVerificationError) {
        return reply.code(401).send({ error: err.message });
      }
      if (err instanceof TenancyError) {
        const status = err.code === 'NOT_A_MEMBER' ? 403 : 400;
        return reply.code(status).send({ error: err.message, code: err.code });
      }
      throw err;
    }
  });
};

/**
 * Fastify plugin: verifies the `Authorization: Bearer …` JWT against the
 * configured Keycloak realm, then resolves an `AuthContext` (membership +
 * org scoping) and attaches it as `request.auth`. Routes marked
 * `{ config: { public: true } }` skip both steps.
 */
export const mirageAuthPlugin = fp(plugin, {
  name: '@mirage/auth',
  fastify: '5.x',
});
