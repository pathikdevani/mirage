import type { FastifyInstance } from 'fastify';

/**
 * `GET /me` — the SPA hits this on app load to learn the signed-in user's
 * org memberships before any Org has been chosen. Declared `noOrg: true`
 * so the auth plugin verifies the JWT but does not require X-Mirage-Org.
 */
export function registerMeRoute(app: FastifyInstance): void {
  app.get('/me', { config: { noOrg: true } }, (request, reply) => {
    const claims = request.authClaims;
    if (!claims) {
      // Defensive: the preHandler should always populate this for noOrg routes.
      return reply.code(500).send({ error: 'authClaims not set on noOrg route' });
    }
    return reply.send({
      userId: claims.userId,
      email: claims.email,
      allOrgIds: claims.allOrgIds,
    });
  });
}
