import type { Cardinality, Strategy } from '@mirage/types';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { NotImplementedError } from './errors.js';
import type { ResolvedRow } from './resolve-schema.js';

export interface ApplyStrategyParams {
  strategy: Strategy;
  sourceRows: ReadonlyArray<ResolvedRow>;
  targetRows: ReadonlyArray<ResolvedRow>;
  cardinality: Cardinality;
  /** Set-level salt — feeds the deterministic RNG handed to custom strategies. */
  salt: string;
  customFunctions: CustomFunctionRegistry;
}

/**
 * For each source row, decide which target row id(s) its Reference points at.
 *
 * Return shape mirrors cardinality:
 * - cardinality `one`  → `string[]`   (one target id per source row)
 * - cardinality `many` → `string[][]` (an array of target ids per source row)
 *
 * Not yet implemented — strategy semantics are the engine's most subtle bit
 * and deserve dedicated focus once we leave bootstrap.
 */
export function applyStrategy(_params: ApplyStrategyParams): string[] | string[][] {
  throw new NotImplementedError('applyStrategy');
}
