import type { Api } from '@mirage/types';
import { EngineError } from './errors.js';
import { extractSetEdges } from './extract-set-edges.js';
import { detectCycles, topoSortWithSoftCycles } from './topology.js';

type MirageSet = Api.components['schemas']['Set'];
type Schema = Api.components['schemas']['Schema'];

export const MAX_ROWS_PER_SCHEMA = 1_000_000;

export interface SoftCycleSchemaSeed {
  schemaKey: string;
  /** Field paths on this schema that peers in the soft-cycle group project. */
  fieldPaths: string[];
}

export interface RunSetPlan {
  /** Topo order of schemaKeys: each key only after every key it hard-references. Soft-cycle members appear as contiguous blocks. */
  order: ReadonlyArray<string>;
  /** Inclusion order from the Set, with validated count values. */
  perSchema: ReadonlyArray<{ schemaKey: string; count: number }>;
  /** Σ count across all inclusions. */
  totalRows: number;
  /**
   * One entry per soft-cycle group. Each entry lists which fields on each
   * member must be seeded before the main streaming pass so peer resolvers
   * have something to read.
   */
  softCycleSeedFields: ReadonlyArray<ReadonlyArray<SoftCycleSchemaSeed>>;
}

export interface PlanRunSetParams {
  set: MirageSet;
  schemas: ReadonlyArray<Schema>;
}

/**
 * Synchronous, pure. Validates a Set against its workspace schemas and
 * computes the generation plan (topo order + totals).
 *
 * Throws `EngineError` with one of:
 *   - 'schema_missing'   — an inclusion references a schema not in `schemas`
 *   - 'count_too_large'  — count exceeds MAX_ROWS_PER_SCHEMA
 *   - 'cycle_in_set'     — at least one hard cycle exists across included schemas
 */
export function planRunSet(params: PlanRunSetParams): RunSetPlan {
  const { set, schemas } = params;

  for (const inc of set.schemas) {
    if (!schemas.some((s) => s.key === inc.schemaKey)) {
      throw new EngineError('schema_missing', { schemaKey: inc.schemaKey });
    }
    if (!Number.isInteger(inc.count) || inc.count < 0) {
      throw new EngineError('count_invalid', { schemaKey: inc.schemaKey, count: inc.count });
    }
    if (inc.count > MAX_ROWS_PER_SCHEMA) {
      throw new EngineError('count_too_large', {
        schemaKey: inc.schemaKey,
        count: inc.count,
        max: MAX_ROWS_PER_SCHEMA,
      });
    }
  }

  const includedKeys = new Set(set.schemas.map((s) => s.schemaKey));
  const edges = extractSetEdges(schemas, includedKeys);
  const cycles = detectCycles(includedKeys, edges);
  if (cycles.length > 0) {
    throw new EngineError('cycle_in_set', { cycles });
  }

  const { order, softCycleGroups } = topoSortWithSoftCycles(includedKeys, edges);

  const softCycleSeedFields: SoftCycleSchemaSeed[][] = softCycleGroups.map((group) => {
    const groupSet = new Set(group);
    const fieldsBySchema = new Map<string, Set<string>>();
    for (const k of group) fieldsBySchema.set(k, new Set());
    for (const e of edges) {
      if (e.hard) continue;
      if (!groupSet.has(e.toSchemaKey)) continue;
      if (!groupSet.has(e.fromSchemaKey)) continue;
      if (e.toFieldPath) fieldsBySchema.get(e.toSchemaKey)!.add(e.toFieldPath);
    }
    return group.map((schemaKey) => ({
      schemaKey,
      fieldPaths: [...(fieldsBySchema.get(schemaKey) ?? [])],
    }));
  });

  const perSchema = set.schemas.map((inc) => ({ schemaKey: inc.schemaKey, count: inc.count }));
  const totalRows = perSchema.reduce((acc, inc) => acc + inc.count, 0);

  return { order, perSchema, totalRows, softCycleSeedFields };
}
