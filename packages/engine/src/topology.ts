import type { SetEdge } from './extract-set-edges.js';

export interface CyclePath {
  schemaKeys: string[];
  fieldPaths: string[];
}

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function detectCycles(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): CyclePath[] {
  const adj = new Map<string, Array<{ to: string; fieldPath: string }>>();
  for (const k of schemaKeys) adj.set(k, []);
  for (const e of edges) {
    adj.get(e.fromSchemaKey)?.push({ to: e.toSchemaKey, fieldPath: e.fromFieldPath });
  }

  const colour = new Map<string, number>();
  for (const k of schemaKeys) colour.set(k, WHITE);

  const cycles: CyclePath[] = [];
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

/**
 * Edge from A → B means A references B. Resolve B before A.
 * Returns insertion order if a cycle prevents a valid topological sort.
 */
export function topoSort(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): string[] {
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
