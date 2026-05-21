import { describe, it, expect } from 'vitest';
import type { SetEdge } from '../extract-set-edges.js';
import { detectCycles, topoSort, topoSortWithSoftCycles } from '../topology.js';

const edge = (
  fromSchemaKey: string,
  toSchemaKey: string,
  fromFieldPath = `${toSchemaKey}_ref`,
): SetEdge => ({
  fromSchemaKey,
  toSchemaKey,
  fromFieldPath,
  cardinality: 'one',
  hard: true,
  cycleKind: 'embedding',
});

const softEdge = (
  fromSchemaKey: string,
  toSchemaKey: string,
  fromFieldPath = `${toSchemaKey}_ref`,
): SetEdge => ({
  fromSchemaKey,
  toSchemaKey,
  fromFieldPath,
  cardinality: 'one',
  hard: false,
});

const hardEdge = (
  fromSchemaKey: string,
  toSchemaKey: string,
  kind: 'embedding' | 'field_deadlock' = 'embedding',
  fromFieldPath = `${toSchemaKey}_ref`,
): SetEdge => ({
  fromSchemaKey,
  toSchemaKey,
  fromFieldPath,
  cardinality: 'one',
  hard: true,
  cycleKind: kind,
});

describe('detectCycles', () => {
  it('returns [] for an acyclic DAG', () => {
    const keys = new Set(['a', 'b', 'c']);
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(detectCycles(keys, edges)).toEqual([]);
  });

  it('finds a 2-node cycle', () => {
    const keys = new Set(['a', 'b']);
    const edges = [edge('a', 'b'), edge('b', 'a')];
    const cycles = detectCycles(keys, edges);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.schemaKeys).toEqual(['a', 'b', 'a']);
  });

  it('finds a self-loop', () => {
    const keys = new Set(['a']);
    const edges = [edge('a', 'a')];
    const cycles = detectCycles(keys, edges);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.schemaKeys).toEqual(['a', 'a']);
  });
});

describe('topoSort', () => {
  it('returns a valid order for a DAG', () => {
    const keys = new Set(['a', 'b', 'c']);
    const edges = [edge('a', 'b'), edge('b', 'c')];
    const order = topoSort(keys, edges);
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
  });

  it('falls back to insertion order when cycles exist', () => {
    const keys = new Set(['a', 'b']);
    const edges = [edge('a', 'b'), edge('b', 'a')];
    const order = topoSort(keys, edges);
    expect(new Set(order)).toEqual(new Set(['a', 'b']));
  });
});

describe('detectCycles soft/hard filtering', () => {
  it('ignores soft-only cycles', () => {
    const keys = new Set(['phone', 'person']);
    const edges = [softEdge('phone', 'person'), softEdge('person', 'phone')];
    expect(detectCycles(keys, edges)).toEqual([]);
  });

  it('reports cycles that contain at least one hard edge with its kind', () => {
    const keys = new Set(['a', 'b']);
    const edges = [hardEdge('a', 'b', 'embedding'), hardEdge('b', 'a', 'embedding')];
    const cycles = detectCycles(keys, edges);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.kind).toBe('embedding');
  });

  it('reports field_deadlock when both edges are hard:field_deadlock', () => {
    const keys = new Set(['a', 'b']);
    const edges = [hardEdge('a', 'b', 'field_deadlock'), hardEdge('b', 'a', 'field_deadlock')];
    const cycles = detectCycles(keys, edges);
    expect(cycles[0]!.kind).toBe('field_deadlock');
  });
});

describe('topoSortWithSoftCycles', () => {
  it('orders an acyclic DAG and returns no soft groups', () => {
    const keys = new Set(['a', 'b', 'c']);
    const edges = [softEdge('a', 'b'), softEdge('b', 'c')];
    const result = topoSortWithSoftCycles(keys, edges);
    expect(result.order.indexOf('c')).toBeLessThan(result.order.indexOf('b'));
    expect(result.order.indexOf('b')).toBeLessThan(result.order.indexOf('a'));
    expect(result.softCycleGroups).toEqual([]);
  });

  it('groups members of a soft cycle and still returns a complete order', () => {
    const keys = new Set(['phone', 'person']);
    const edges = [softEdge('phone', 'person'), softEdge('person', 'phone')];
    const result = topoSortWithSoftCycles(keys, edges);
    expect(new Set(result.order)).toEqual(new Set(['phone', 'person']));
    expect(result.softCycleGroups).toHaveLength(1);
    expect(new Set(result.softCycleGroups[0]!)).toEqual(new Set(['phone', 'person']));
  });

  it('groups a singleton schema that soft-references itself', () => {
    const keys = new Set(['mobile']);
    const edges = [softEdge('mobile', 'mobile', 'person_id')];
    const result = topoSortWithSoftCycles(keys, edges);
    expect(result.order).toEqual(['mobile']);
    expect(result.softCycleGroups).toEqual([['mobile']]);
  });
});
