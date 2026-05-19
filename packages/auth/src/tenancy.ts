import {
  asId,
  type AuthContext,
  type MirageJwtClaims,
  type OrgId,
  type Role,
  type UserId,
} from '@mirage/types';

/**
 * Resolves the membership for a `(userId, orgId)` pair. Implementations live
 * in the workspace service (Mongo lookup). Auth stays pure by accepting the
 * resolver as a function.
 */
export type MembershipResolver = (userId: UserId, orgId: OrgId) => Promise<{ role: Role } | null>;

export class TenancyError extends Error {
  override readonly name = 'TenancyError';
  readonly code: 'MISSING_ORG_HEADER' | 'NOT_A_MEMBER' | 'INVALID_ORG_HEADER';
  constructor(code: TenancyError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Keycloak groups appear in the JWT as path strings like `/acme` or
 * `/parent/child`. We use the *leaf* segment as the `OrgId`, matching the
 * `attributes.orgId` we set in the realm import.
 */
export function deriveAllOrgIds(claims: MirageJwtClaims): OrgId[] {
  return (claims.groups ?? [])
    .map((g) => g.replace(/^\/+/, '').split('/').pop() ?? '')
    .filter((g) => g.length > 0)
    .map((g) => asId<OrgId>(g));
}

/**
 * Build the `AuthContext` attached to every authenticated request. Trust
 * boundary: this is the only place plain strings cross into branded ids.
 */
export async function resolveAuthContext(args: {
  claims: MirageJwtClaims;
  /** Value of the `X-Mirage-Org` request header. */
  requestedOrgId: string | undefined;
  resolveMembership: MembershipResolver;
}): Promise<AuthContext> {
  const { claims, requestedOrgId, resolveMembership } = args;

  if (!requestedOrgId || requestedOrgId.length === 0) {
    throw new TenancyError(
      'MISSING_ORG_HEADER',
      'X-Mirage-Org header is required on every request',
    );
  }
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(requestedOrgId)) {
    throw new TenancyError('INVALID_ORG_HEADER', `Invalid org id: ${requestedOrgId}`);
  }

  const allOrgIds = deriveAllOrgIds(claims);

  const orgId = asId<OrgId>(requestedOrgId);
  if (!allOrgIds.includes(orgId)) {
    throw new TenancyError('NOT_A_MEMBER', `User is not a member of org "${requestedOrgId}"`);
  }

  const userId = asId<UserId>(claims.sub);
  const membership = await resolveMembership(userId, orgId);
  if (!membership) {
    // Should not happen if Keycloak group + Mongo memberships are kept in sync,
    // but guard anyway — Mongo is the canonical role source.
    throw new TenancyError('NOT_A_MEMBER', `No membership row for (${userId}, ${orgId})`);
  }

  return {
    userId,
    orgId,
    role: membership.role,
    allOrgIds,
  };
}
