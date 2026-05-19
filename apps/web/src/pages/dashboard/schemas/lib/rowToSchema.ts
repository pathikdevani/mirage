import type { SchemaProp } from './types.js';
import { REF_PREFIX } from './types.js';

/**
 * Convert a builder property into a JSON-Schema fragment. Ported from
 * `design/screens_export/DataTable.jsx:1081-1116`. Used for the live preview
 * in Step 3 of the Create sheet.
 */
type JsonSchemaFragment = {
  type: string;
  format?: string;
  faker?: { method?: string; args?: unknown[] };
  properties?: Record<string, JsonSchemaFragment>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchemaFragment;
  minItems?: number;
  maxItems?: number;
};

export function rowToSchema(row: SchemaProp): JsonSchemaFragment {
  const out: JsonSchemaFragment = { type: row.type };
  if (row.format) out.format = row.format;
  if (row.faker && row.type !== 'object' && row.type !== 'array') {
    if (row.faker.startsWith(REF_PREFIX)) {
      const parts = row.faker.slice(REF_PREFIX.length).split('.');
      out.faker = { args: [{ $ref: `#/schema/${parts[0] ?? ''}/${parts.slice(1).join('.')}` }] };
    } else {
      out.faker = { method: row.faker };
    }
  }
  if (row.type === 'object') {
    out.properties = {};
    const req: string[] = [];
    for (const f of row.fields ?? []) {
      out.properties[f.name] = rowToSchema(f);
      if (f.required) req.push(f.name);
    }
    if (req.length) out.required = req;
    out.additionalProperties = false;
  }
  if (row.type === 'array') {
    out.items = row.items ? rowToSchema(row.items) : { type: 'string' };
    out.minItems = 1;
    out.maxItems = 5;
  }
  return out;
}

export function rootSchemaToJson(
  rows: SchemaProp[],
  id: string,
  title: string,
  description: string,
): unknown {
  const root = rowToSchema({
    name: '__root__',
    type: 'object',
    required: false,
    fields: rows,
  });
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: id,
    title,
    description,
    ...root,
  };
}
