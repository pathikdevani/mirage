import type { CustomFunctionId, OrgId, SchemaId, WorkspaceId } from './branded.js';

/**
 * Schema vocabulary, ported directly from CONTEXT.md.
 *
 * A Schema describes a single record's shape. Each property is one of four
 * kinds: Primitive, Object, Array, or Reference. Object and Array nest
 * recursively to any depth. Primitive fields produce their value from exactly
 * one Value Generator: a faker.js method or a Custom Function.
 */

// ---------- Value Generators ----------

export type PrimitiveType = 'string' | 'number' | 'boolean' | 'date';

/** Reference to any faker.js method, e.g. `faker.person.firstName`. */
export interface FakerGenerator {
  type: 'faker';
  /** Dotted path within the faker namespace, e.g. `"person.firstName"`. */
  method: string;
  /** Positional args forwarded to the faker method. */
  args?: ReadonlyArray<unknown>;
}

export interface CustomFunctionGenerator {
  type: 'customFunction';
  functionId: CustomFunctionId;
}

export type ValueGenerator = FakerGenerator | CustomFunctionGenerator;

// ---------- Cardinality (used by both Schema-side declaration and Set-side overrides) ----------

export interface OneCardinality {
  type: 'one';
}

export interface ManyCardinality {
  type: 'many';
  min: number;
  max: number;
}

export type Cardinality = OneCardinality | ManyCardinality;

// ---------- Property tree ----------

export interface PropertyBase {
  optional: boolean;
}

export interface PrimitiveProperty extends PropertyBase {
  kind: 'primitive';
  primitiveType: PrimitiveType;
  generator: ValueGenerator;
}

export interface ObjectProperty extends PropertyBase {
  kind: 'object';
  /** Inline nested properties keyed by name. Has no identity of its own. */
  properties: Record<string, Property>;
}

export interface ArrayProperty extends PropertyBase {
  kind: 'array';
  itemProperty: Property;
  /** Number of items per row. `min === max` for fixed-length arrays. */
  count: { min: number; max: number };
}

/**
 * A pointer to a row of another Schema in the same Workspace.
 * Per CONTEXT.md, a Reference declared on a Schema fixes target / field name /
 * the existence of the field; a Set may only override cardinality + optionality.
 */
export interface ReferenceProperty extends PropertyBase {
  kind: 'reference';
  targetSchemaId: SchemaId;
  cardinality: Cardinality;
}

export type Property = PrimitiveProperty | ObjectProperty | ArrayProperty | ReferenceProperty;

// ---------- Schema ----------

export interface Schema {
  id: SchemaId;
  orgId: OrgId;
  workspaceId: WorkspaceId;
  name: string;
  description?: string;
  /** Top-level property tree. The root of every row is always an object. */
  properties: Record<string, Property>;
  createdAt: string;
  updatedAt: string;
}
