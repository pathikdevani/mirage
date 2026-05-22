import type { Api } from '@mirage/types';
import { extractFnIds } from '@mirage/types';

/**
 * Walk every schema's property tree and yield every `fn` segment in a
 * property's `value` AST.
 */

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

export interface FnRef {
  schemaKey: string;
  /** Dotted path; `[]` separates array property names. */
  fieldPath: string;
  functionId: string;
}

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
    if (Array.isArray(p.value)) {
      for (const id of extractFnIds(p.value)) {
        out.push({ schemaKey, fieldPath: path, functionId: id });
      }
    }
    if (p.type === 'object' && Array.isArray(p.fields)) {
      walk(p.fields, path, schemaKey, out);
    } else if (p.type === 'array' && p.items) {
      walk([p.items], `${path}[]`, schemaKey, out);
    }
  }
}
