import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import { planRunSet, MAX_ROWS_PER_SCHEMA } from '../plan-run-set.js';
import { EngineError } from '../errors.js';

type Schema = Api.components['schemas']['Schema'];
type MirageSet = Api.components['schemas']['Set'];

const primitive = (name: string, faker = 'string.uuid'): Api.components['schemas']['SchemaProp'] => ({
  name,
  type: 'string',
  faker,
  required: false,
});

const schema = (key: string, props: Api.components['schemas']['SchemaProp'][] = []): Schema =>
  ({
    id: `sch_${key}`,
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key,
    name: key,
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    properties: [primitive('id'), ...props],
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as Schema;

const baseSet = (inclusions: { schemaKey: string; count: number }[]): MirageSet =>
  ({
    id: 'set_1',
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key: 'demo',
    name: 'demo',
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    salt: 'salt',
    schemas: inclusions,
    strategies: [],
    output: { format: 'ndjson', locale: 'en', workerPool: 1 },
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as MirageSet;

describe('planRunSet', () => {
  it('returns topo order and totals for a simple acyclic set', () => {
    const schemas = [schema('a'), schema('b', [primitive('aRef', '$ref:a')])];
    const set = baseSet([
      { schemaKey: 'a', count: 10 },
      { schemaKey: 'b', count: 5 },
    ]);
    const plan = planRunSet({ set, schemas });
    expect(plan.order).toEqual(['a', 'b']);
    expect(plan.perSchema).toEqual([
      { schemaKey: 'a', count: 10 },
      { schemaKey: 'b', count: 5 },
    ]);
    expect(plan.totalRows).toBe(15);
  });

  it('throws cycle_in_set when a cycle exists', () => {
    const schemas = [
      schema('a', [primitive('bRef', '$ref:b')]),
      schema('b', [primitive('aRef', '$ref:a')]),
    ];
    const set = baseSet([
      { schemaKey: 'a', count: 1 },
      { schemaKey: 'b', count: 1 },
    ]);
    expect(() => planRunSet({ set, schemas })).toThrow(EngineError);
    try {
      planRunSet({ set, schemas });
    } catch (err) {
      expect((err as EngineError).code).toBe('cycle_in_set');
    }
  });

  it('throws schema_missing when an inclusion references an unknown schema', () => {
    const schemas = [schema('a')];
    const set = baseSet([{ schemaKey: 'ghost', count: 1 }]);
    expect(() => planRunSet({ set, schemas })).toThrow(/schema_missing/);
  });

  it('throws count_too_large when count exceeds MAX_ROWS_PER_SCHEMA', () => {
    const schemas = [schema('a')];
    const set = baseSet([{ schemaKey: 'a', count: MAX_ROWS_PER_SCHEMA + 1 }]);
    expect(() => planRunSet({ set, schemas })).toThrow(/count_too_large/);
  });

  it('accepts count exactly at MAX_ROWS_PER_SCHEMA', () => {
    const schemas = [schema('a')];
    const set = baseSet([{ schemaKey: 'a', count: MAX_ROWS_PER_SCHEMA }]);
    const plan = planRunSet({ set, schemas });
    expect(plan.totalRows).toBe(MAX_ROWS_PER_SCHEMA);
  });
});
