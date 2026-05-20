import { fetchDevAccessToken, loadKeycloakConfig } from './keycloak.js';

/**
 * Test environment config — read from process.env so the same binary can run
 * against local dev, CI, or a deployed stack.
 *
 * By default the suite auto-issues a fresh dev/dev token against the seeded
 * Keycloak realm. Override with MIRAGE_TEST_TOKEN if pointing at a stack
 * where you already have a token (e.g. a deployed staging env).
 *
 * MIRAGE_TEST_ORG: org id matching the token's `groups` claim. Defaults to
 *   "acme" which is what the seeded dev realm uses.
 * MIRAGE_BFF_URL / MIRAGE_BFF_WS_URL: override for non-local stacks.
 */
export interface E2eEnv {
  bffUrl: string;
  bffWsUrl: string;
  token: string;
  orgId: string;
}

export async function loadE2eEnv(): Promise<E2eEnv> {
  const bffUrl = process.env['MIRAGE_BFF_URL'] ?? 'http://localhost:4000';
  const bffWsUrl = process.env['MIRAGE_BFF_WS_URL'] ?? bffUrl.replace(/^http/, 'ws');
  const orgId = process.env['MIRAGE_TEST_ORG'] ?? 'acme';

  const overrideToken = process.env['MIRAGE_TEST_TOKEN'];
  const token = overrideToken ?? (await fetchDevAccessToken(loadKeycloakConfig()));

  return { bffUrl, bffWsUrl, token, orgId };
}
