import type { CustomFunctionId, OrgId, WorkspaceId } from './branded.js';

/**
 * A user-written JavaScript function stored at the Workspace level (CONTEXT.md).
 * Even when authored from a field's editor, it is always saved as a
 * Workspace-level entity. May be used as a Value Generator on a Primitive
 * field, or as a `custom` Strategy on a Reference, provided the signature fits.
 */
export interface CustomFunction {
  id: CustomFunctionId;
  orgId: OrgId;
  workspaceId: WorkspaceId;
  name: string;
  /**
   * Determines which call sites accept this function.
   * - `valueGenerator` → callable as `(ctx) => primitiveValue`
   * - `strategy`       → callable as `({ sourceRows, targetRows, cardinality, rng, salt }) => string[] | string[][]`
   * - `both`           → satisfies either signature (the source must handle both inputs)
   */
  usage: 'valueGenerator' | 'strategy' | 'both';
  /** JavaScript source. Executed inside the sandbox (see packages/sandbox). */
  source: string;
  createdAt: string;
  updatedAt: string;
}
