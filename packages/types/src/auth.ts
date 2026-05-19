import type { OrgId, UserId } from './branded.js';
import type { Role } from './org.js';

/**
 * Tenancy context attached to every authenticated request by `packages/auth`.
 * Derived from the JWT + the explicit `X-Mirage-Org` header
 * (TECH_ARCHITECHRE.md §3.6).
 */
export interface AuthContext {
  userId: UserId;
  /** The single Org this request is scoped to (from the `X-Mirage-Org` header). */
  orgId: OrgId;
  /** Resolved role for `(userId, orgId)` — workspace overrides apply later. */
  role: Role;
  /** All orgs the user belongs to, from the JWT. Useful for org-switcher UIs. */
  allOrgIds: ReadonlyArray<OrgId>;
}

/** Subset of Keycloak JWT claims we rely on. */
export interface MirageJwtClaims {
  sub: string;
  email?: string;
  preferred_username?: string;
  /** Keycloak group paths (e.g. `["/acme"]`). Used to derive `allOrgIds`. */
  groups?: string[];
}
