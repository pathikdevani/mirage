import type { CustomFunctionId, OrgId, SchemaId, SetId, WorkspaceId } from './branded.js';
import type { Cardinality } from './schema.js';

/**
 * Set + Strategy vocabulary, ported from CONTEXT.md.
 *
 * A Set is the *recipe*: it pins which Schemas participate, how many rows of
 * each, the Strategy for every Reference, and the deterministic salt. Running
 * a Set produces rows; rows are ephemeral and re-derivable from `Set + salt`.
 */

// ---------- Strategy ----------

export interface OneToOneStrategy {
  type: '1:1';
}

export interface RandomStrategy {
  type: 'random';
  /**
   * Only meaningful when the Reference's cardinality is `many`. Controls
   * whether the same target id may appear more than once within a single
   * source row's array. (Across source rows duplicates are a property of
   * randomness, not a configurable option.)
   */
  allowDuplicates?: boolean;
}

export interface EvenSplitStrategy {
  type: 'evenSplit';
}

export interface CustomStrategy {
  type: 'custom';
  /**
   * The Custom Function must accept `({ sourceRows, targetRows, cardinality, rng, salt })`
   * and return `string[]` for cardinality `one` or `string[][]` for cardinality `many`.
   */
  functionId: CustomFunctionId;
}

export type Strategy = OneToOneStrategy | RandomStrategy | EvenSplitStrategy | CustomStrategy;

// ---------- Per-Set Reference override ----------

/**
 * A Set may override **only** cardinality + optionality of a Reference — never
 * the target Schema, the field name, or the existence of the field
 * (CONTEXT.md). The override applies to that Set's Run only and never mutates
 * the underlying Schema.
 */
export interface SetReferenceOverride {
  schemaId: SchemaId;
  /** Dotted path to the Reference field within the Schema's property tree. */
  fieldPath: string;
  cardinality?: Cardinality;
  optional?: boolean;
  /** Required: every Reference in a Set must be assigned a Strategy. */
  strategy: Strategy;
}

// ---------- Schema inclusion in a Set ----------

export interface SetSchemaInclusion {
  schemaId: SchemaId;
  /** How many rows of this Schema to produce in a Run. */
  count: number;
}

// ---------- Set ----------

export interface MirageSet {
  id: SetId;
  orgId: OrgId;
  workspaceId: WorkspaceId;
  name: string;
  description?: string;
  schemas: SetSchemaInclusion[];
  /** Strategy overrides keyed by `${schemaId}:${fieldPath}` for lookups. */
  references: SetReferenceOverride[];
  /**
   * Deterministic seed. Same `Set definition + salt` always produces the same
   * rows. Stored as a string so users can pick something memorable.
   */
  salt: string;
  createdAt: string;
  updatedAt: string;
}
