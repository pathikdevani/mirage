import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { EngineError } from './errors.js';
import { hashSeed, mulberry32 } from './rng.js';
import type { SetEdge } from './extract-set-edges.js';
import type { ResolvedRow } from './resolve-schema.js';

type Strategy = Api.components['schemas']['Strategy'];

/**
 * Resolver returned by createStrategyResolver. Pure-ish — does not allocate
 * shared state between calls beyond what was captured at factory time.
 * For cardinality 'one', returns the projected target value.
 * For cardinality 'many', returns an array of projected target values.
 */
export type StrategyResolver = (sourceIndex: number) => unknown;

export interface CreateStrategyResolverParams {
  strategy: Strategy;
  edge: SetEdge;
  sourceCount: number;
  targetCount: number;
  /** When `edge.toFieldPath` is set, used to look up the projected value at target index. Throws if missing. */
  targetProjection?: (targetIndex: number) => unknown;
  /** Required for custom strategies; ignored otherwise. */
  sourceRows?: ReadonlyArray<ResolvedRow>;
  targetRows?: ReadonlyArray<ResolvedRow>;
  many?: { min: number; max: number };
  salt: string;
  customFunctions?: CustomFunctionRegistry;
  sandbox?: SandboxPool;
}

const targetIdFor = (salt: string, schemaKey: string, i: number): string =>
  `${salt}:${schemaKey}:${i}`;

export async function createStrategyResolver(
  params: CreateStrategyResolverParams,
): Promise<StrategyResolver> {
  const { strategy, edge, sourceCount, targetCount, targetProjection, salt, many } = params;

  const projectAt = (targetIndex: number): unknown =>
    edge.toFieldPath
      ? targetProjection!(targetIndex)
      : targetIdFor(salt, edge.toSchemaKey, targetIndex);

  if (strategy.type === '1:1') {
    if (edge.cardinality !== 'one') {
      throw new EngineError('strategy_11_cardinality', {
        fromSchemaKey: edge.fromSchemaKey,
        fromFieldPath: edge.fromFieldPath,
        cardinality: edge.cardinality,
      });
    }
    if (sourceCount !== targetCount) {
      throw new EngineError('strategy_11_count_mismatch', {
        fromSchemaKey: edge.fromSchemaKey,
        fromFieldPath: edge.fromFieldPath,
        source: sourceCount,
        target: targetCount,
      });
    }
    return (i: number) => projectAt(i);
  }

  if (strategy.type === 'evenSplit') {
    if (targetCount === 0) {
      throw new EngineError('strategy_no_targets', {
        fromSchemaKey: edge.fromSchemaKey,
        fromFieldPath: edge.fromFieldPath,
      });
    }
    if (edge.cardinality === 'one') {
      return (i: number) => projectAt(i % targetCount);
    }
    const range = many ?? { min: 1, max: 1 };
    const k = clampInt(Math.round(targetCount / Math.max(1, sourceCount)), range.min, range.max);
    return (i: number) => {
      const out: unknown[] = [];
      for (let j = 0; j < k; j++) {
        out.push(projectAt((i * k + j) % targetCount));
      }
      return out;
    };
  }

  if (strategy.type === 'random') {
    return makeRandomResolver({ ...params, projectAt });
  }

  if (strategy.type === 'custom') {
    return await makeCustomResolver({ ...params, projectAt });
  }

  throw new EngineError('strategy_unknown', {
    fromSchemaKey: edge.fromSchemaKey,
    fromFieldPath: edge.fromFieldPath,
    strategy,
  });
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

// ---------- random ----------

interface RandomCtx extends CreateStrategyResolverParams {
  projectAt: (targetIndex: number) => unknown;
}

function makeRandomResolver(ctx: RandomCtx): StrategyResolver {
  const { strategy, edge, targetCount, salt, many, projectAt } = ctx;
  if (targetCount === 0) {
    throw new EngineError('strategy_no_targets', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
    });
  }
  const baseSeedParts = [salt, edge.fromSchemaKey, edge.fromFieldPath] as const;

  if (edge.cardinality === 'one') {
    return (i: number) => {
      const rng = mulberry32(hashSeed(...baseSeedParts, String(i)));
      const idx = Math.floor(rng() * targetCount);
      return projectAt(idx);
    };
  }

  const allowDuplicates = (strategy as { allowDuplicates?: boolean }).allowDuplicates !== false;
  const range = many ?? { min: 1, max: 1 };

  return (i: number) => {
    const rng = mulberry32(hashSeed(...baseSeedParts, String(i)));
    const k = clampInt(
      range.min + Math.floor(rng() * (range.max - range.min + 1)),
      0,
      targetCount,
    );
    if (k === 0) return [];
    if (allowDuplicates) {
      const out: unknown[] = [];
      for (let j = 0; j < k; j++) {
        out.push(projectAt(Math.floor(rng() * targetCount)));
      }
      return out;
    }
    // Floyd's algorithm: O(k) draw-without-replacement from [0, targetCount).
    const chosen = new Set<number>();
    const limit = Math.min(k, targetCount);
    for (let j = targetCount - limit; j < targetCount; j++) {
      const t = Math.floor(rng() * (j + 1));
      chosen.add(chosen.has(t) ? j : t);
    }
    return Array.from(chosen, projectAt);
  };
}

// ---------- custom ----------

async function makeCustomResolver(ctx: RandomCtx): Promise<StrategyResolver> {
  const { strategy, edge, sourceRows, targetRows, salt, customFunctions, sandbox } = ctx;
  const fnId = (strategy as { functionId?: string }).functionId;
  if (typeof fnId !== 'string' || fnId.length === 0) {
    throw new EngineError('strategy_custom_missing_fn', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
    });
  }
  if (!customFunctions) {
    throw new EngineError('strategy_custom_missing_registry', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
    });
  }
  const entry = customFunctions.get(fnId);
  if (!entry) {
    throw new EngineError('fn_target_missing', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
      functionId: fnId,
    });
  }
  if (entry.usage === 'valueGenerator') {
    throw new EngineError('fn_usage_mismatch', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
      functionId: fnId,
      usage: entry.usage,
    });
  }
  if (!sandbox) {
    throw new EngineError('strategy_custom_missing_sandbox', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
    });
  }
  if (!sourceRows || !targetRows) {
    throw new EngineError('strategy_custom_missing_rows', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
    });
  }

  const callerCtx = {
    sourceRows,
    targetRows,
    cardinality: edge.cardinality,
    __rngSeed: hashSeed(salt, edge.fromSchemaKey, edge.fromFieldPath, 'strategy'),
    salt,
  };
  const raw = await sandbox.invoke(entry.source, callerCtx);
  if (!validateCustomResult(raw, edge.cardinality, sourceRows.length)) {
    throw new EngineError('strategy_custom_bad_shape', {
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
      functionId: fnId,
      cardinality: edge.cardinality,
    });
  }

  // Map the returned __id strings to projected values via the index lookup the
  // orchestrator pre-built. Targets aren't necessarily addressed by index in
  // a custom function (they may return any subset of __ids), so build a Map.
  const idToProjected = new Map<string, unknown>();
  for (let j = 0; j < targetRows.length; j++) {
    idToProjected.set(
      targetRows[j]!.__id,
      edge.toFieldPath
        ? getByPath(targetRows[j]! as Record<string, unknown>, edge.toFieldPath)
        : targetRows[j]!.__id,
    );
  }

  if (edge.cardinality === 'one') {
    const arr = raw as string[];
    return (i: number) => idToProjected.get(arr[i]!) ?? arr[i]!;
  }
  const arr = raw as string[][];
  return (i: number) => arr[i]!.map((id) => idToProjected.get(id) ?? id);
}

function validateCustomResult(
  result: unknown,
  cardinality: 'one' | 'many',
  expectedLength: number,
): boolean {
  if (!Array.isArray(result) || result.length !== expectedLength) return false;
  if (cardinality === 'one') return result.every((x) => typeof x === 'string');
  return result.every(
    (x) => Array.isArray(x) && (x as unknown[]).every((y) => typeof y === 'string'),
  );
}

function getByPath(row: Record<string, unknown>, path: string): unknown {
  let cur: unknown = row;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
