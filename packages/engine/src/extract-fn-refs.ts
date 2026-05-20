import type { Api } from '@mirage/types';

/**
 * Walk every schema's property tree and yield every `$fn:<id>` reference.
 * Mirrors extract-set-edges.ts in shape — operates on the OpenAPI Schema shape
 * (array-of-props with `faker: "$fn:<id>"` strings).
 */

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

export interface FnRef {
  schemaKey: string;
  /** Dotted path; `[]` separates array property names. */
  fieldPath: string;
  functionId: string;
}

const FN_RE = /^\$fn:(cfn_[A-Za-z0-9_-]{16})$/;

export function extractFnRefs(schemas: ReadonlyArray<Schema>): FnRef[] {
  const out: FnRef[] = [];
  for (const schema of schemas) {
    walk(schema.properties, '', schema.key, out);
  }
  return out;
}

function walk(props: SchemaProp[], basePath: string, schemaKey: string, out: FnRef[]): void {
  for (const p of props) {
    const path = basePath ? `${basePath}.${p.name}` : p.name;
    if (typeof p.faker === 'string') {
      const m = p.faker.match(FN_RE);
      if (m) {
        out.push({ schemaKey, fieldPath: path, functionId: m[1]! });
      }
    }
    if (p.type === 'object' && Array.isArray(p.fields)) {
      walk(p.fields, path, schemaKey, out);
    } else if (p.type === 'array' && p.items) {
      walk([p.items], `${path}[]`, schemaKey, out);
    }
  }
}
