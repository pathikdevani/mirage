import { describe, it, expect } from 'vitest';
import type { SetEdge } from '../extract-set-edges.js';
import { detectCycles, topoSort } from '../topology.js';

const edge = (
  fromSchemaKey: string,
  toSchemaKey: string,
  fromFieldPath = `${toSchemaKey}_ref`,
): SetEdge => ({
  fromSchemaKey,
  toSchemaKey,
  fromFieldPath,
  cardinality: 'one',
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
    // a → b means "a references b" → resolve b before a.
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
