import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { generateRows } from './generate-rows.js';

type Schema = Api.components['schemas']['Schema'];

export interface RefPlaceholder {
  readonly __ref: true;
  readonly toSchemaKey: string;
  readonly fromFieldPath: string;
}

export function isRefPlaceholder(v: unknown): v is RefPlaceholder {
  return Boolean(v && typeof v === 'object' && (v as { __ref?: unknown }).__ref === true);
}

export interface ResolvedRow {
  readonly __schemaKey: string;
  readonly __id: string;
  readonly [field: string]: unknown;
}

export interface ResolveSchemaParams {
  schema: Schema;
  count: number;
  salt: string;
  locale: string;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

/**
 * Drains `generateRows` into an array. Kept for the few callers that still
 * want the full materialized array (e.g. custom strategy fallback, tests).
 * Prefer `generateRows` for streaming.
 */
export async function resolveSchema(params: ResolveSchemaParams): Promise<ResolvedRow[]> {
  const out: ResolvedRow[] = [];
  for await (const row of generateRows(params)) out.push(row);
  return out;
}
