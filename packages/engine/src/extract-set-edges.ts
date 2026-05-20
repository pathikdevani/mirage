import type { Api } from '@mirage/types';

/**
 * Compute cross-schema reference edges within a Set.
 *
 * Operates on the OpenAPI Schema shape (array-of-props with `$ref:<key>(.path)?`
 * strings on `faker`), which is what's actually persisted — distinct from the
 * abstract `Property` tree in `packages/types/src/schema.ts` (currently unused).
 *
 * An edge is emitted whenever an included schema's property has
 * `faker: "$ref:<targetKey>(.path)?"` AND `targetKey` is also in `includedKeys`.
 * References to schemas outside the inclusion set are silently skipped — they're
 * not edges *within this Set*; they will be resolved against the workspace at
 * run time once the engine is real.
 *
 * `cardinality` is `'many'` iff the ref appears at or under any `array` ancestor.
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
}

const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;

export function extractSetEdges(
  schemas: ReadonlyArray<Schema>,
  includedKeys: ReadonlySet<string>,
): SetEdge[] {
  const out: SetEdge[] = [];
  for (const schema of schemas) {
    if (!includedKeys.has(schema.key)) continue;
    walk(schema.properties, '', false, schema.key, includedKeys, out);
  }
  return out;
}

function walk(
  props: SchemaProp[],
  basePath: string,
  insideArray: boolean,
  fromSchemaKey: string,
  includedKeys: ReadonlySet<string>,
  out: SetEdge[],
): void {
  for (const p of props) {
    const path = basePath ? `${basePath}.${p.name}` : p.name;
    if (typeof p.faker === 'string') {
      const m = p.faker.match(REF_RE);
      if (m && includedKeys.has(m[1]!)) {
        out.push({
          fromSchemaKey,
          fromFieldPath: path,
          toSchemaKey: m[1]!,
          ...(m[2] ? { toFieldPath: m[2] } : {}),
          cardinality: insideArray ? 'many' : 'one',
        });
      }
    }
    if (p.type === 'object' && Array.isArray(p.fields)) {
      walk(p.fields, path, insideArray, fromSchemaKey, includedKeys, out);
    } else if (p.type === 'array' && p.items) {
      walk([p.items], `${path}[]`, true, fromSchemaKey, includedKeys, out);
    }
  }
}
