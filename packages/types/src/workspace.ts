import type { OrgId, UserId, WorkspaceId } from './branded.js';

/**
 * A Workspace is the top-level container that holds all of one project's
 * Schemas, Sets, and Custom Functions. A user can own many Workspaces, but
 * cross-workspace references are not permitted. See CONTEXT.md.
 */
export interface Workspace {
  id: WorkspaceId;
  orgId: OrgId;
  name: string;
  description?: string;
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
}
