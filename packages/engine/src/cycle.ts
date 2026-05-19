import type { Property, Schema, SchemaId } from '@mirage/types';

/**
 * Reference-cycle detection over a Workspace's Schemas.
 *
 * Shared by BFF / workspace-svc (canonical, blocks save) and the SPA's
 * relationship graph (live edge highlighting). One implementation, no drift —
 * see TECH_ARCHITECHRE.md §3.3.
 *
 * The detector finds *all* simple cycles using a colour-marked DFS that
 * reports each back edge it encounters. Self-loops are returned as a single
 * `[A, A]` cycle. Edges pointing to schemas outside the provided set are
 * treated as orphan references (not cycles) — surface those via a separate
 * validation pass.
 */

// ---------- Public types ----------

export interface ReferenceEdge {
  /** Schema the edge originates from. */
  fromSchemaId: SchemaId;
  /** Schema the edge points at. */
  toSchemaId: SchemaId;
  /** Dotted path to the Reference property within the source schema's tree. */
  fieldPath: string;
}

export interface ReferenceCycle {
  /**
   * Schema ids in cycle order, with the back-edge target repeated at the end.
   * Length is always `fieldPaths.length + 1`. Example: `[A, B, C, A]` paired
   * with `["b_ref", "c_ref", "a_ref"]`.
   */
  schemaIds: SchemaId[];
  /** Field paths used at each hop. `fieldPaths[i]` is the field on `schemaIds[i]` that points to `schemaIds[i+1]`. */
  fieldPaths: string[];
}

export interface CycleDetectionResult {
  /** Every cycle discovered. A schema may appear in more than one cycle. */
  cycles: ReferenceCycle[];
  /** Set of schema ids participating in at least one cycle — convenience for UI highlighting. */
  schemasInCycles: ReadonlySet<SchemaId>;
}

// ---------- Edge extraction ----------

/**
 * Walk a Schema's property tree and yield every Reference edge with its
 * dotted field path. Arrays are denoted `field[]`, nested objects with `.`.
 */
export function* extractReferenceEdges(schema: Schema): Generator<ReferenceEdge> {
  for (const edge of walkProperties(schema.properties, '')) {
    yield { fromSchemaId: schema.id, ...edge };
  }
}

function* walkProperties(
  properties: Record<string, Property>,
  prefix: string,
): Generator<{ toSchemaId: SchemaId; fieldPath: string }> {
  for (const [name, prop] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${name}` : name;
    yield* walkProperty(prop, path);
  }
}

function* walkProperty(
  prop: Property,
  path: string,
): Generator<{ toSchemaId: SchemaId; fieldPath: string }> {
  switch (prop.kind) {
    case 'primitive':
      return;
    case 'reference':
      yield { toSchemaId: prop.targetSchemaId, fieldPath: path };
      return;
    case 'object':
      yield* walkProperties(prop.properties, path);
      return;
    case 'array':
      yield* walkProperty(prop.itemProperty, `${path}[]`);
      return;
  }
}

// ---------- Cycle detection ----------

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;
type Colour = typeof WHITE | typeof GRAY | typeof BLACK;

export function detectReferenceCycles(schemas: ReadonlyArray<Schema>): CycleDetectionResult {
  // Build adjacency from each schema id to its outgoing reference edges.
  const adjacency = new Map<SchemaId, ReferenceEdge[]>();
  for (const schema of schemas) {
    adjacency.set(schema.id, [...extractReferenceEdges(schema)]);
  }

  const colour = new Map<SchemaId, Colour>();
  for (const schema of schemas) {
    colour.set(schema.id, WHITE);
  }

  const cycles: ReferenceCycle[] = [];
  const schemasInCycles = new Set<SchemaId>();

  /** Stack frame: schema currently being explored + the field path that got us here. */
  interface Frame {
    schemaId: SchemaId;
    /** `''` for the DFS root; otherwise the path on the predecessor that led here. */
    incomingFieldPath: string;
  }
  const stack: Frame[] = [];

  const visit = (schemaId: SchemaId, incomingFieldPath: string): void => {
    colour.set(schemaId, GRAY);
    stack.push({ schemaId, incomingFieldPath });

    for (const edge of adjacency.get(schemaId) ?? []) {
      const targetColour = colour.get(edge.toSchemaId);

      if (targetColour === undefined) {
        // Edge to a schema outside the provided set — orphan; not our concern.
        continue;
      }

      if (targetColour === WHITE) {
        visit(edge.toSchemaId, edge.fieldPath);
        continue;
      }

      if (targetColour === GRAY) {
        // Back edge found — reconstruct the cycle from the current stack.
        const startIdx = stack.findIndex((f) => f.schemaId === edge.toSchemaId);
        // findIndex returning -1 here would mean the GRAY node isn't on the
        // current stack, which violates the colour invariant. Guard anyway.
        if (startIdx === -1) continue;

        const cyclePath = stack.slice(startIdx);
        const cycle: ReferenceCycle = {
          schemaIds: [...cyclePath.map((f) => f.schemaId), edge.toSchemaId],
          fieldPaths: [...cyclePath.slice(1).map((f) => f.incomingFieldPath), edge.fieldPath],
        };
        cycles.push(cycle);
        for (const f of cyclePath) {
          schemasInCycles.add(f.schemaId);
        }
      }
      // BLACK: fully explored, no cycle through this branch — nothing to do.
    }

    stack.pop();
    colour.set(schemaId, BLACK);
  };

  for (const schema of schemas) {
    if (colour.get(schema.id) === WHITE) {
      visit(schema.id, '');
    }
  }

  return { cycles, schemasInCycles };
}
