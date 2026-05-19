import type { Schema, SchemaId } from '@mirage/types';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { NotImplementedError } from './errors.js';

/**
 * A row produced by `resolveSchema`. Identity metadata is on namespaced keys
 * (`__schemaId`, `__id`) so they can't collide with user-defined property
 * names. Field values are typed as `unknown` here — the engine's job is to
 * produce the shape; downstream consumers narrow if needed.
 */
export interface ResolvedRow {
  readonly __schemaId: SchemaId;
  readonly __id: string;
  readonly [field: string]: unknown;
}

export interface ResolveSchemaParams {
  schema: Schema;
  /** How many rows to produce. */
  count: number;
  /** Set-level salt; same `Set + salt` ⇒ same rows. */
  salt: string;
  customFunctions: CustomFunctionRegistry;
}

/**
 * Produce `count` rows for `schema`, *without* resolving References. References
 * are filled in afterwards by `applyStrategy` so all source/target id pools
 * exist before assignment runs.
 *
 * Not yet implemented — landing in product work once the engine becomes the
 * focus.
 */
export function resolveSchema(_params: ResolveSchemaParams): ResolvedRow[] {
  throw new NotImplementedError('resolveSchema');
}
