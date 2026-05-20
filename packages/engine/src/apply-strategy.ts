import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { EngineError } from './errors.js';
import { hashSeed, mulberry32 } from './rng.js';
import type { ResolvedRow } from './resolve-schema.js';

type Strategy = Api.components['schemas']['Strategy'];

export interface ApplyStrategyParams {
  strategy: Strategy;
  sourceRows: ReadonlyArray<ResolvedRow>;
  targetRows: ReadonlyArray<ResolvedRow>;
  cardinality: 'one' | 'many';
  many?: { min: number; max: number };
  salt: string;
  fromSchemaKey: string;
  fromFieldPath: string;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

export async function applyStrategy(params: ApplyStrategyParams): Promise<string[] | string[][]> {
  const {
    strategy,
    sourceRows,
    targetRows,
    cardinality,
    many,
    salt,
    fromSchemaKey,
    fromFieldPath,
    customFunctions,
    sandbox,
  } = params;
  const rng = mulberry32(hashSeed(salt, fromSchemaKey, fromFieldPath));

  if (strategy.type === '1:1') {
    if (cardinality !== 'one') {
      throw new EngineError('strategy_11_cardinality', {
        fromSchemaKey,
        fromFieldPath,
        cardinality,
      });
    }
    if (sourceRows.length !== targetRows.length) {
      throw new EngineError('strategy_11_count_mismatch', {
        fromSchemaKey,
        fromFieldPath,
        source: sourceRows.length,
        target: targetRows.length,
      });
    }
    return sourceRows.map((_, i) => targetRows[i]!.__id);
  }

  if (strategy.type === 'evenSplit') {
    if (targetRows.length === 0) {
      throw new EngineError('strategy_no_targets', { fromSchemaKey, fromFieldPath });
    }
    if (cardinality === 'one') {
      return sourceRows.map((_, i) => targetRows[i % targetRows.length]!.__id);
    }
    const range = many ?? { min: 1, max: 1 };
    return sourceRows.map((_, i) => {
      const k = clampInt(
        Math.round(targetRows.length / Math.max(1, sourceRows.length)),
        range.min,
        range.max,
      );
      const out: string[] = [];
      for (let j = 0; j < k; j++) {
        const idx = (i * k + j) % targetRows.length;
        out.push(targetRows[idx]!.__id);
      }
      return out;
    });
  }

  if (strategy.type === 'random') {
    if (targetRows.length === 0) {
      throw new EngineError('strategy_no_targets', { fromSchemaKey, fromFieldPath });
    }
    if (cardinality === 'one') {
      return sourceRows.map(() => {
        const idx = Math.floor(rng() * targetRows.length);
        return targetRows[idx]!.__id;
      });
    }
    const range = many ?? { min: 1, max: 1 };
    const allowDuplicates = (strategy as { allowDuplicates?: boolean }).allowDuplicates !== false;
    return sourceRows.map(() => {
      const k = clampInt(
        range.min + Math.floor(rng() * (range.max - range.min + 1)),
        0,
        targetRows.length,
      );
      if (k === 0) return [];
      if (allowDuplicates) {
        const out: string[] = [];
        for (let j = 0; j < k; j++) {
          out.push(targetRows[Math.floor(rng() * targetRows.length)]!.__id);
        }
        return out;
      }
      const pool: string[] = targetRows.map((r) => r.__id);
      const picks: string[] = [];
      const limit = Math.min(k, pool.length);
      for (let j = 0; j < limit; j++) {
        const swapIdx = j + Math.floor(rng() * (pool.length - j));
        const tmp = pool[j]!;
        pool[j] = pool[swapIdx]!;
        pool[swapIdx] = tmp;
        picks.push(pool[j]!);
      }
      return picks;
    });
  }

  if (strategy.type === 'custom') {
    const functionId = (strategy as { functionId?: string }).functionId;
    if (typeof functionId !== 'string' || functionId.length === 0) {
      throw new EngineError('strategy_custom_missing_fn', { fromSchemaKey, fromFieldPath });
    }
    const entry = customFunctions.get(functionId);
    if (!entry) {
      throw new EngineError('fn_target_missing', { fromSchemaKey, fromFieldPath, functionId });
    }
    if (entry.usage === 'valueGenerator') {
      throw new EngineError('fn_usage_mismatch', {
        fromSchemaKey,
        fromFieldPath,
        functionId,
        usage: entry.usage,
      });
    }
    const ctx = {
      sourceRows,
      targetRows,
      cardinality,
      __rngSeed: hashSeed(salt, fromSchemaKey, fromFieldPath, 'strategy'),
      salt,
    };
    const result = await sandbox.invoke(entry.source, ctx);
    if (!validateStrategyResult(result, cardinality, sourceRows.length)) {
      throw new EngineError('strategy_custom_bad_shape', {
        fromSchemaKey,
        fromFieldPath,
        functionId,
        cardinality,
      });
    }
    return result as string[] | string[][];
  }

  throw new EngineError('strategy_unknown', { fromSchemaKey, fromFieldPath, strategy });
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function validateStrategyResult(
  result: unknown,
  cardinality: 'one' | 'many',
  expectedLength: number,
): boolean {
  if (!Array.isArray(result) || result.length !== expectedLength) return false;
  if (cardinality === 'one') {
    return result.every((x) => typeof x === 'string');
  }
  return result.every(
    (x) => Array.isArray(x) && (x as unknown[]).every((y) => typeof y === 'string'),
  );
}
