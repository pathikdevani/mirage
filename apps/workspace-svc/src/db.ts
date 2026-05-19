import { MongoClient, type Collection, type Db } from 'mongodb';
import type { Api, Membership, OrgId, UserId, Workspace, WorkspaceId } from '@mirage/types';
import { env } from './env.js';

export type SchemaDoc = Api.components['schemas']['Schema'];

/**
 * Mongo wrapper. Single client, two collections we care about today
 * (`workspaces` + `memberships`). Indexes are created idempotently on first
 * connect so a fresh dev environment works without a migration step.
 *
 * Per TECH_ARCHITECHRE.md §6 every persisted document carries `orgId`, and
 * compound indexes are `(orgId, …)` from day one.
 */

export interface MirageDb {
  client: MongoClient;
  db: Db;
  workspaces: Collection<Workspace>;
  memberships: Collection<Membership>;
  schemas: Collection<SchemaDoc>;
}

export async function connectDb(): Promise<MirageDb> {
  const client = new MongoClient(env.mongoUrl, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(env.mongoDb);

  const workspaces = db.collection<Workspace>('workspaces');
  const memberships = db.collection<Membership>('memberships');
  const schemas = db.collection<SchemaDoc>('schemas');

  await Promise.all([
    workspaces.createIndex({ orgId: 1, id: 1 }, { unique: true }),
    workspaces.createIndex({ orgId: 1, updatedAt: -1 }),
    memberships.createIndex({ userId: 1, orgId: 1, workspaceId: 1 }, { unique: true }),
    memberships.createIndex({ orgId: 1, userId: 1 }),
    schemas.createIndex({ workspaceId: 1, key: 1 }, { unique: true }),
    schemas.createIndex({ workspaceId: 1, updatedAt: -1 }),
    schemas.createIndex({ orgId: 1, workspaceId: 1 }),
  ]);

  return { client, db, workspaces, memberships, schemas };
}

/**
 * Membership lookup conforming to `@mirage/auth`'s `MembershipResolver`.
 * Only returns the org-level row; workspace-scoped overrides are evaluated
 * per request inside the workspace routes themselves.
 *
 * JIT-provisioning: Keycloak's group membership is the source of truth for
 * "is this user allowed in this org" (already verified upstream against
 * `claims.groups`). If no Mongo row exists yet, we create one with the dev
 * default role `editor`. Once role assignment is real (per-org admin UI),
 * this provisioning step is replaced by an explicit invite/accept flow.
 */
export function makeMembershipResolver(db: MirageDb) {
  return async (userId: UserId, orgId: OrgId) => {
    const existing = await db.memberships.findOne({
      userId,
      orgId,
      workspaceId: { $exists: false },
    });
    if (existing) return { role: existing.role };

    const seeded: Membership = { userId, orgId, role: 'editor' };
    await db.memberships.insertOne(seeded);
    return { role: seeded.role };
  };
}

export type { Workspace, WorkspaceId };
