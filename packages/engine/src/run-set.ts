import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { applyStrategy } from './apply-strategy.js';
import { extractSetEdges, type SetEdge } from './extract-set-edges.js';
import { EngineError } from './errors.js';
import {
  isRefPlaceholder,
  resolveSchema,
  type RefPlaceholder,
  type ResolvedRow,
} from './resolve-schema.js';

type MirageSet = Api.components['schemas']['Set'];
type Schema = Api.components['schemas']['Schema'];
type Strategy = Api.components['schemas']['Strategy'];

export interface RunSetParams {
  set: MirageSet;
  schemas: ReadonlyArray<Schema>;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

export interface RunSetResult {
  rowsByKey: Map<string, ResolvedRow[]>;
  edges: ReadonlyArray<SetEdge>;
}

export async function runSet(params: RunSetParams): Promise<RunSetResult> {
  const { set, schemas, customFunctions, sandbox } = params;

  const includedKeys = new Set(set.schemas.map((s) => s.schemaKey));
  for (const inc of set.schemas) {
    if (!schemas.some((s) => s.key === inc.schemaKey)) {
      throw new EngineError('schema_missing', { schemaKey: inc.schemaKey });
    }
  }

  const edges = extractSetEdges(schemas, includedKeys);

  const cycles = detectCycles(includedKeys, edges);
  if (cycles.length > 0) {
    throw new EngineError('cycle_in_set', { cycles });
  }

  const order = topoSort(includedKeys, edges);

  const rowsByKey = new Map<string, ResolvedRow[]>();
  for (const schemaKey of order) {
    const inc = set.schemas.find((s) => s.schemaKey === schemaKey)!;
    const schema = schemas.find((s) => s.key === schemaKey)!;
    const rows = await resolveSchema({
      schema,
      count: inc.count,
      salt: set.salt,
      locale: set.output.locale,
      customFunctions,
      sandbox,
    });
    rowsByKey.set(schemaKey, rows);
  }

  for (const edge of edges) {
    const sourceRows = rowsByKey.get(edge.fromSchemaKey);
    const targetRows = rowsByKey.get(edge.toSchemaKey);
    if (!sourceRows || !targetRows) continue;

    const override = set.strategies.find(
      (o) => o.schemaKey === edge.fromSchemaKey && o.fieldPath === edge.fromFieldPath,
    );
    const strategy: Strategy = override?.strategy ?? { type: '1:1' };
    const cardinality = edge.cardinality;
    const many = cardinality === 'many' ? { min: 1, max: 3 } : undefined;

    const values = await applyStrategy({
      strategy,
      sourceRows,
      targetRows,
      cardinality,
      ...(many ? { many } : {}),
      salt: set.salt,
      fromSchemaKey: edge.fromSchemaKey,
      fromFieldPath: edge.fromFieldPath,
      ...(edge.toFieldPath ? { toFieldPath: edge.toFieldPath } : {}),
      customFunctions,
      sandbox,
    });

    for (let i = 0; i < sourceRows.length; i++) {
      const row = sourceRows[i]!;
      substituteRef(row as Record<string, unknown>, edge.fromFieldPath, values[i]!);
    }
  }

  return { rowsByKey, edges };
}

function detectCycles(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): Array<{ schemaKeys: string[]; fieldPaths: string[] }> {
  const adj = new Map<string, Array<{ to: string; fieldPath: string }>>();
  for (const k of schemaKeys) adj.set(k, []);
  for (const e of edges) {
    adj.get(e.fromSchemaKey)?.push({ to: e.toSchemaKey, fieldPath: e.fromFieldPath });
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const colour = new Map<string, number>();
  for (const k of schemaKeys) colour.set(k, WHITE);

  const cycles: Array<{ schemaKeys: string[]; fieldPaths: string[] }> = [];
  const stack: Array<{ key: string; incomingField: string }> = [];

  const visit = (key: string, incomingField: string): void => {
    colour.set(key, GRAY);
    stack.push({ key, incomingField });
    for (const e of adj.get(key) ?? []) {
      const c = colour.get(e.to);
      if (c === undefined) continue;
      if (c === GRAY) {
        const startIdx = stack.findIndex((f) => f.key === e.to);
        if (startIdx === -1) continue;
        const cyclePath = stack.slice(startIdx);
        cycles.push({
          schemaKeys: [...cyclePath.map((f) => f.key), e.to],
          fieldPaths: [...cyclePath.slice(1).map((f) => f.incomingField), e.fieldPath],
        });
      } else if (c === WHITE) {
        visit(e.to, e.fieldPath);
      }
    }
    stack.pop();
    colour.set(key, BLACK);
  };

  for (const k of schemaKeys) {
    if (colour.get(k) === WHITE) visit(k, '');
  }
  return cycles;
}

function topoSort(schemaKeys: ReadonlySet<string>, edges: ReadonlyArray<SetEdge>): string[] {
  // Edge from A → B means A references B. Resolve B before A.
  const inDeg = new Map<string, number>();
  for (const k of schemaKeys) inDeg.set(k, 0);
  const reverseAdj = new Map<string, string[]>();
  for (const k of schemaKeys) reverseAdj.set(k, []);
  for (const e of edges) {
    inDeg.set(e.fromSchemaKey, (inDeg.get(e.fromSchemaKey) ?? 0) + 1);
    reverseAdj.get(e.toSchemaKey)?.push(e.fromSchemaKey);
  }
  const queue: string[] = [];
  for (const [k, d] of inDeg) if (d === 0) queue.push(k);
  const out: string[] = [];
  while (queue.length > 0) {
    const k = queue.shift()!;
    out.push(k);
    for (const next of reverseAdj.get(k) ?? []) {
      const d = (inDeg.get(next) ?? 0) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (out.length !== schemaKeys.size) {
    return [...schemaKeys];
  }
  return out;
}

function substituteRef(
  row: Record<string, unknown>,
  fieldPath: string,
  replacement: unknown,
): void {
  const parts = parsePath(fieldPath);
  walkAndReplace(row, parts, 0, replacement);
}

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

export type { RefPlaceholder };
