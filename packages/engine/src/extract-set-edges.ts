import type { Api } from '@mirage/types';
import { extractCrossSchemaRefs } from '@mirage/types';
import { buildFakerIndex, classifyRefEdge } from './classify-ref-edges.js';

/**
 * Compute cross-schema reference edges within a Set.
 *
 * An edge is emitted whenever an included schema's property has a value
 * segment of kind `ref` whose target's schema key is also in `includedKeys`.
 * References to schemas outside the inclusion set are silently skipped — they
 * resolve against the workspace at run time, not within this Set.
 *
 * `cardinality` is `'many'` iff the ref appears at or under any `array`
 * ancestor.
 *
 * Each edge is classified `hard` (true data dependency — embedding or
 * field-projection deadlock) or `soft` (scalar projection that resolves to a
 * primitive). Cycle detectors should ignore soft edges.
 */

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

export interface SetEdge {
  fromSchemaKey: string;
  /** Dotted path; `[]` separates array property names. Example: `addresses[].cityRef`. */
  fromFieldPath: string;
  toSchemaKey: string;
  /** Dotted path of the field on the target schema whose value is projected. Undefined ⇒ project `__id`. */
  toFieldPath?: string;
  cardinality: 'one' | 'many';
  /** Whether this edge constitutes a true data dependency. Cycles through soft-only edges are allowed. */
  hard: boolean;
  /** Only set when `hard === true`. */
  cycleKind?: 'embedding' | 'field_deadlock';
}

export function extractSetEdges(
  schemas: ReadonlyArray<Schema>,
  includedKeys: ReadonlySet<string>,
): SetEdge[] {
  const fakerIndex = buildFakerIndex(schemas);
  const out: SetEdge[] = [];
  for (const schema of schemas) {
    if (!includedKeys.has(schema.key)) continue;
    walk(schema.properties, '', false, schema.key, includedKeys, fakerIndex, out);
  }
  return out;
}

function walk(
  props: SchemaProp[],
  basePath: string,
  insideArray: boolean,
  fromSchemaKey: string,
  includedKeys: ReadonlySet<string>,
  fakerIndex: ReturnType<typeof buildFakerIndex>,
  out: SetEdge[],
): void {
  for (const p of props) {
    const path = basePath ? `${basePath}.${p.name}` : p.name;
    if (Array.isArray(p.value)) {
      for (const target of extractCrossSchemaRefs(p.value)) {
        const dot = target.indexOf('.');
        const targetKey = dot < 0 ? target : target.slice(0, dot);
        const targetField = dot < 0 ? undefined : target.slice(dot + 1);
        if (!includedKeys.has(targetKey)) continue;
        const cls = classifyRefEdge(
          { fromSchemaKey, fromFieldPath: path, targetKey, targetField },
          fakerIndex,
        );
        const edge: SetEdge = {
          fromSchemaKey,
          fromFieldPath: path,
          toSchemaKey: targetKey,
          ...(targetField ? { toFieldPath: targetField } : {}),
          cardinality: insideArray ? 'many' : 'one',
          hard: cls.hard,
          ...(cls.hard ? { cycleKind: cls.kind } : {}),
        };
        out.push(edge);
      }
    }
    if (p.type === 'object' && Array.isArray(p.fields)) {
      walk(p.fields, path, insideArray, fromSchemaKey, includedKeys, fakerIndex, out);
    } else if (p.type === 'array' && p.items) {
      walk([p.items], `${path}[]`, true, fromSchemaKey, includedKeys, fakerIndex, out);
    }
  }
}
