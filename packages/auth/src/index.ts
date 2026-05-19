/**
 * `@mirage/auth` — Keycloak JWT verification + tenancy resolution.
 *
 * Two surfaces:
 * - Pure functions: `createKeycloakVerifier`, `resolveAuthContext` — usable from any service.
 * - Fastify plugin: `mirageAuthPlugin` (sub-export `@mirage/auth/fastify`) — drop-in for our Fastify services.
 *
 * The plugin's heavy lifting is just composition of the two pure pieces.
 */

export * from './jwt.js';
export * from './tenancy.js';
export { mirageAuthPlugin } from './fastify-plugin.js';
export type { MirageAuthPluginOptions } from './fastify-plugin.js';
