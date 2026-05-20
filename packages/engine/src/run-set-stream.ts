import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { EngineError } from './errors.js';
import { extractSetEdges, type SetEdge } from './extract-set-edges.js';
import { generateRows } from './generate-rows.js';
import { planRunSet } from './plan-run-set.js';
import { createStrategyResolver, type StrategyResolver } from './strategy-resolver.js';
import { isRefPlaceholder, type ResolvedRow } from './resolve-schema.js';

type MirageSet = Api.components['schemas']['Set'];
type Schema = Api.components['schemas']['Schema'];
type Strategy = Api.components['schemas']['Strategy'];

export interface RowBatch {
  schemaKey: string;
  rows: ReadonlyArray<ResolvedRow>;
  schemaProduced: number;
  schemaTotal: number;
  totalProduced: number;
  totalRows: number;
}

export interface RunSetStreamParams {
  set: MirageSet;
  schemas: ReadonlyArray<Schema>;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
  batchSize?: number;
  signal?: AbortSignal;
}

export class CancelledError extends Error {
  override readonly name = 'CancelledError';
}

const DEFAULT_BATCH_SIZE = 500;

export async function* runSetStream(params: RunSetStreamParams): AsyncIterable<RowBatch> {
  const { set, schemas, customFunctions, sandbox, signal } = params;
  const batchSize = Math.max(1, params.batchSize ?? DEFAULT_BATCH_SIZE);

  const plan = planRunSet({ set, schemas });
  const includedKeys = new Set(plan.order);
  const allEdges = extractSetEdges(schemas, includedKeys);
  const edgesByFrom = groupBy(allEdges, (e) => e.fromSchemaKey);
  const countByKey = new Map(plan.perSchema.map((p) => [p.schemaKey, p.count] as const));

  // Schemas that participate (as source OR target) in any custom-strategy
  // edge must be fully materialised before the resolver can be built.
  const customSchemas = new Set<string>();
  // schemaKey → set of fieldPaths the downstream side wants to project.
  const projectionsNeeded = new Map<string, Set<string>>();
  for (const e of allEdges) {
    const override = strategyFor(set, e);
    if (override.type === 'custom') {
      customSchemas.add(e.fromSchemaKey);
      customSchemas.add(e.toSchemaKey);
    }
    if (e.toFieldPath) {
      if (!projectionsNeeded.has(e.toSchemaKey)) {
        projectionsNeeded.set(e.toSchemaKey, new Set());
      }
      projectionsNeeded.get(e.toSchemaKey)!.add(e.toFieldPath);
    }
  }

  const materialisedRows = new Map<string, ResolvedRow[]>();
  // schemaKey → fieldPath → values[]
  const projectedColumns = new Map<string, Map<string, unknown[]>>();

  let totalProduced = 0;
  const totalRows = plan.totalRows;

  for (const schemaKey of plan.order) {
    if (signal?.aborted) throw new CancelledError();

    const schema = schemas.find((s) => s.key === schemaKey)!;
    const schemaTotal = countByKey.get(schemaKey) ?? 0;

    // Build a resolver per outgoing edge from this schema.
    const outgoing = edgesByFrom.get(schemaKey) ?? [];
    const resolvers = new Map<string, StrategyResolver>();
    for (const e of outgoing) {
      const override = strategyFor(set, e);
      const targetCount = countByKey.get(e.toSchemaKey) ?? 0;
      const targetProjection =
        e.toFieldPath !== undefined
          ? (idx: number) => projectedColumns.get(e.toSchemaKey)?.get(e.toFieldPath!)?.[idx]
          : undefined;

      const isCustomEdge = override.type === 'custom';
      const baseParams = {
        strategy: override,
        edge: e,
        sourceCount: schemaTotal,
        targetCount,
        salt: set.salt,
        customFunctions,
        sandbox,
        ...(targetProjection ? { targetProjection } : {}),
        ...(e.cardinality === 'many' ? { many: { min: 1, max: 3 } } : {}),
      };

      const resolver = isCustomEdge
        ? await createStrategyResolver({
            ...baseParams,
            sourceRows: await materialiseSchema(e.fromSchemaKey, {
              schemas,
              countByKey,
              customFunctions,
              sandbox,
              salt: set.salt,
              locale: set.output.locale,
              cache: materialisedRows,
            }),
            targetRows: await materialiseSchema(e.toSchemaKey, {
              schemas,
              countByKey,
              customFunctions,
              sandbox,
              salt: set.salt,
              locale: set.output.locale,
              cache: materialisedRows,
            }),
          })
        : await createStrategyResolver(baseParams);
      resolvers.set(edgeKey(e), resolver);
    }

    // Open per-field projection arrays for this schema, if needed.
    const myProjections = projectionsNeeded.get(schemaKey);
    if (myProjections) {
      projectedColumns.set(schemaKey, new Map([...myProjections].map((p) => [p, []])));
    }

    let schemaProduced = 0;
    let buffer: ResolvedRow[] = [];

    for await (const row of generateRows({
      schema,
      count: schemaTotal,
      salt: set.salt,
      locale: set.output.locale,
      customFunctions,
      sandbox,
    })) {
      const sourceIndex = schemaProduced + buffer.length;
      for (const e of outgoing) {
        const resolver = resolvers.get(edgeKey(e))!;
        const value = resolver(sourceIndex);
        substituteRef(row as Record<string, unknown>, e.fromFieldPath, value);
      }
      buffer.push(row);

      if (myProjections) {
        const cols = projectedColumns.get(schemaKey)!;
        for (const fp of myProjections) {
          cols.get(fp)!.push(getByPath(row as Record<string, unknown>, fp));
        }
      }

      if (buffer.length >= batchSize) {
        if (signal?.aborted) throw new CancelledError();
        schemaProduced += buffer.length;
        totalProduced += buffer.length;
        yield {
          schemaKey,
          rows: buffer,
          schemaProduced,
          schemaTotal,
          totalProduced,
          totalRows,
        };
        buffer = [];
      }
    }
    if (buffer.length > 0) {
      schemaProduced += buffer.length;
      totalProduced += buffer.length;
      yield {
        schemaKey,
        rows: buffer,
        schemaProduced,
        schemaTotal,
        totalProduced,
        totalRows,
      };
      buffer = [];
    }

    if (schemaProduced !== schemaTotal) {
      throw new EngineError('runset_internal', {
        schemaKey,
        schemaProduced,
        schemaTotal,
      });
    }
  }
}

// ---------- helpers ----------

function strategyFor(set: MirageSet, edge: SetEdge): Strategy {
  const override = set.strategies.find(
    (o) => o.schemaKey === edge.fromSchemaKey && o.fieldPath === edge.fromFieldPath,
  );
  return override?.strategy ?? { type: '1:1' };
}

function edgeKey(e: SetEdge): string {
  return `${e.fromSchemaKey}::${e.fromFieldPath}::${e.toSchemaKey}::${e.toFieldPath ?? ''}`;
}

function groupBy<T, K>(arr: ReadonlyArray<T>, k: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const x of arr) {
    const key = k(x);
    let lst = out.get(key);
    if (!lst) {
      lst = [];
      out.set(key, lst);
    }
    lst.push(x);
  }
  return out;
}

interface MaterialiseCtx {
  schemas: ReadonlyArray<Schema>;
  countByKey: ReadonlyMap<string, number>;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
  salt: string;
  locale: string;
  cache: Map<string, ResolvedRow[]>;
}

async function materialiseSchema(
  schemaKey: string,
  ctx: MaterialiseCtx,
): Promise<ReadonlyArray<ResolvedRow>> {
  const cached = ctx.cache.get(schemaKey);
  if (cached) return cached;
  const schema = ctx.schemas.find((s) => s.key === schemaKey);
  if (!schema) throw new EngineError('schema_missing', { schemaKey });
  const count = ctx.countByKey.get(schemaKey) ?? 0;
  const rows: ResolvedRow[] = [];
  for await (const r of generateRows({
    schema,
    count,
    salt: ctx.salt,
    locale: ctx.locale,
    customFunctions: ctx.customFunctions,
    sandbox: ctx.sandbox,
  })) {
    rows.push(r);
  }
  ctx.cache.set(schemaKey, rows);
  return rows;
}

// ---------- ref substitution ----------

interface PathSegment {
  kind: 'field' | 'arrayItem';
  name?: string;
}

function parsePath(p: string): PathSegment[] {
  const segs: PathSegment[] = [];
  for (const raw of p.split('.')) {
    let cur = raw;
    while (cur.endsWith('[]')) {
      const name = cur.slice(0, -2);
      if (name) segs.push({ kind: 'field', name });
      segs.push({ kind: 'arrayItem' });
      cur = '';
    }
    if (cur) segs.push({ kind: 'field', name: cur });
  }
  return segs;
}

function substituteRef(
  row: Record<string, unknown>,
  fieldPath: string,
  replacement: unknown,
): void {
  walkAndReplace(row, parsePath(fieldPath), 0, replacement);
}

function walkAndReplace(
  node: unknown,
  segs: PathSegment[],
  idx: number,
  replacement: unknown,
): void {
  if (idx >= segs.length) return;
  const seg = segs[idx]!;
  if (seg.kind === 'field') {
    const obj = node as Record<string, unknown>;
    const child = obj[seg.name!];
    if (idx === segs.length - 1) {
      if (isRefPlaceholder(child)) {
        obj[seg.name!] = replacement;
      }
      return;
    }
    walkAndReplace(child, segs, idx + 1, replacement);
  } else {
    if (!Array.isArray(node)) return;
    for (const item of node) {
      walkAndReplace(item, segs, idx + 1, replacement);
    }
  }
}

function getByPath(row: Record<string, unknown>, path: string): unknown {
  let cur: unknown = row;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
