import type { SetEdge } from './extract-set-edges.js';

export interface CyclePath {
  schemaKeys: string[];
  fieldPaths: string[];
  /** Worst kind among the hard edges in the cycle. */
  kind: 'embedding' | 'field_deadlock';
}

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function detectCycles(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): CyclePath[] {
  const hardEdges = edges.filter((e) => e.hard);

  const adj = new Map<
    string,
    Array<{ to: string; fieldPath: string; kind: 'embedding' | 'field_deadlock' }>
  >();
  for (const k of schemaKeys) adj.set(k, []);
  for (const e of hardEdges) {
    adj.get(e.fromSchemaKey)?.push({
      to: e.toSchemaKey,
      fieldPath: e.fromFieldPath,
      kind: e.cycleKind ?? 'embedding',
    });
  }

  const colour = new Map<string, number>();
  for (const k of schemaKeys) colour.set(k, WHITE);

  const cycles: CyclePath[] = [];
  const stack: Array<{
    key: string;
    incomingField: string;
    incomingKind: 'embedding' | 'field_deadlock' | null;
  }> = [];

  const visit = (
    key: string,
    incomingField: string,
    incomingKind: 'embedding' | 'field_deadlock' | null,
  ): void => {
    colour.set(key, GRAY);
    stack.push({ key, incomingField, incomingKind });
    for (const e of adj.get(key) ?? []) {
      const c = colour.get(e.to);
      if (c === undefined) continue;
      if (c === GRAY) {
        const startIdx = stack.findIndex((f) => f.key === e.to);
        if (startIdx === -1) continue;
        const cyclePath = stack.slice(startIdx);
        const kinds = [
          ...cyclePath.slice(1).map((f) => f.incomingKind ?? 'embedding'),
          e.kind,
        ];
        const kind: 'embedding' | 'field_deadlock' = kinds.includes('embedding')
          ? 'embedding'
          : 'field_deadlock';
        cycles.push({
          schemaKeys: [...cyclePath.map((f) => f.key), e.to],
          fieldPaths: [...cyclePath.slice(1).map((f) => f.incomingField), e.fieldPath],
          kind,
        });
      } else if (c === WHITE) {
        visit(e.to, e.fieldPath, e.kind);
      }
    }
    stack.pop();
    colour.set(key, BLACK);
  };

  for (const k of schemaKeys) {
    if (colour.get(k) === WHITE) visit(k, '', null);
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
  return topoSortWithSoftCycles(schemaKeys, edges).order;
}

/**
 * Like `topoSort` but partitions schemas that form soft-only SCCs (size ≥ 2)
 * into `softCycleGroups`. Order is a full permutation of `schemaKeys`: acyclic
 * nodes are ordered normally; each soft group is placed as a contiguous block
 * after every schema the group hard-depends on.
 */
export function topoSortWithSoftCycles(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): { order: string[]; softCycleGroups: string[][] } {
  const softAdj = new Map<string, string[]>();
  const softReverseAdj = new Map<string, string[]>();
  for (const k of schemaKeys) {
    softAdj.set(k, []);
    softReverseAdj.set(k, []);
  }
  for (const e of edges) {
    if (e.hard) continue;
    if (!softAdj.has(e.fromSchemaKey) || !softAdj.has(e.toSchemaKey)) continue;
    softAdj.get(e.fromSchemaKey)!.push(e.toSchemaKey);
    softReverseAdj.get(e.toSchemaKey)!.push(e.fromSchemaKey);
  }

  // Kosaraju SCC
  const order: string[] = [];
  const seen = new Set<string>();
  const dfs1 = (n: string): void => {
    if (seen.has(n)) return;
    seen.add(n);
    for (const m of softAdj.get(n) ?? []) dfs1(m);
    order.push(n);
  };
  for (const k of schemaKeys) dfs1(k);

  const sccId = new Map<string, number>();
  let nextId = 0;
  const assign = (n: string, id: number): void => {
    if (sccId.has(n)) return;
    sccId.set(n, id);
    for (const m of softReverseAdj.get(n) ?? []) assign(m, id);
  };
  for (let i = order.length - 1; i >= 0; i--) {
    const k = order[i]!;
    if (!sccId.has(k)) {
      assign(k, nextId);
      nextId++;
    }
  }

  const groupsById = new Map<number, string[]>();
  for (const k of schemaKeys) {
    const id = sccId.get(k)!;
    if (!groupsById.has(id)) groupsById.set(id, []);
    groupsById.get(id)!.push(k);
  }
  // Singleton SCCs with a self-edge are real soft cycles too — Kosaraju doesn't
  // promote them to size 2, so filtering on `g.length > 1` alone would silently
  // skip the seed pass for a schema that soft-references itself.
  const hasSelfLoop = (k: string): boolean => (softAdj.get(k) ?? []).includes(k);
  const softCycleGroups = [...groupsById.values()].filter(
    (g) => g.length > 1 || (g.length === 1 && hasSelfLoop(g[0]!)),
  );

  // Condensed topo over SCCs. Edge A→B (A references B) ⇒ B before A.
  const nodeOfSchema = (k: string): number => sccId.get(k)!;
  const condensedInDeg = new Map<number, number>();
  const condensedReverseAdj = new Map<number, number[]>();
  for (const id of groupsById.keys()) {
    condensedInDeg.set(id, 0);
    condensedReverseAdj.set(id, []);
  }
  const edgeSeen = new Set<string>();
  for (const e of edges) {
    if (!schemaKeys.has(e.fromSchemaKey) || !schemaKeys.has(e.toSchemaKey)) continue;
    const a = nodeOfSchema(e.fromSchemaKey);
    const b = nodeOfSchema(e.toSchemaKey);
    if (a === b) continue;
    const tag = `${a}->${b}`;
    if (edgeSeen.has(tag)) continue;
    edgeSeen.add(tag);
    condensedInDeg.set(a, (condensedInDeg.get(a) ?? 0) + 1);
    condensedReverseAdj.get(b)!.push(a);
  }

  const queue: number[] = [];
  for (const [id, d] of condensedInDeg) if (d === 0) queue.push(id);
  const condensedOrder: number[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    condensedOrder.push(id);
    for (const next of condensedReverseAdj.get(id) ?? []) {
      const d = (condensedInDeg.get(next) ?? 0) - 1;
      condensedInDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (condensedOrder.length !== groupsById.size) {
    return { order: [...schemaKeys], softCycleGroups };
  }

  const flatOrder: string[] = [];
  for (const id of condensedOrder) {
    for (const k of groupsById.get(id)!) flatOrder.push(k);
  }
  return { order: flatOrder, softCycleGroups };
}
