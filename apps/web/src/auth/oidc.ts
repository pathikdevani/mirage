import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { env } from '../env.js';

/**
 * Single shared OIDC client. PKCE-based authorization code flow against the
 * Keycloak realm. Tokens persisted in localStorage so a tab refresh keeps the
 * session — fine for dev; for prod we'd move to httpOnly cookies via the BFF.
 */
export const userManager = new UserManager({
  authority: `${env.keycloak.url}/realms/${env.keycloak.realm}`,
  client_id: env.keycloak.clientId,
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  // The id_token already carries profile + email claims; hitting Keycloak's
  // /userinfo just to re-fetch them is redundant and breaks when the realm
  // serves signed JWT responses (Content-Type the SDK rejects).
  loadUserInfo: false,
});

export const login = (): Promise<void> => userManager.signinRedirect();
export const logout = (): Promise<void> => userManager.signoutRedirect();
