import type { OrgId, UserId, WorkspaceId } from './branded.js';

/**
 * An Organisation is the top tenancy unit. In Keycloak it's represented as a
 * Group; Mirage mirrors a thin record here for per-workspace overrides and
 * display metadata. See TECH_ARCHITECHRE.md §3.6.
 */
export interface Org {
  id: OrgId;
  name: string;
  /** Keycloak group id this Org is mirrored from. */
  keycloakGroupId: string;
  createdAt: string;
}

export type Role = 'owner' | 'editor' | 'viewer';

/**
 * A user's role within an Org or, optionally, within a specific Workspace
 * (workspace-level override). Per-workspace rows beat the org-level row.
 */
export interface Membership {
  userId: UserId;
  orgId: OrgId;
  /** When set, this row is a workspace-scoped override of the org-level role. */
  workspaceId?: WorkspaceId;
  role: Role;
}
