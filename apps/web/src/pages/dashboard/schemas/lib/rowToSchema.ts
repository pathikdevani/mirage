import type { SchemaProp } from './types.js';
import { isPureMethod, isPureRef } from '@mirage/types';

/**
 * Convert a builder property into a JSON-Schema fragment. Used for the live
 * preview. Pure-method and pure-ref single-segment values produce a `faker`
 * fragment; mixed templates are not represented in JSON Schema (the preview
 * just shows the base type — generation happens at run time).
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
  if (Array.isArray(row.value) && row.type !== 'object' && row.type !== 'array') {
    if (isPureRef(row.value)) {
      const parts = row.value[0].target.split('.');
      out.faker = { args: [{ $ref: `#/schema/${parts[0] ?? ''}/${parts.slice(1).join('.')}` }] };
    } else if (isPureMethod(row.value)) {
      out.faker = { method: row.value[0].method };
    }
    // Mixed templates / pure text / pure fn intentionally omit the faker fragment.
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
