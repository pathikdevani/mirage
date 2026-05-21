import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import { createStrategyResolver } from '../strategy-resolver.js';
import type { SetEdge } from '../extract-set-edges.js';
import type { ResolvedRow } from '../resolve-schema.js';
import { customFunctionRegistryFromMap } from '../custom-function-registry.js';

type Strategy = Api.components['schemas']['Strategy'];

const edge = (overrides: Partial<SetEdge> = {}): SetEdge => ({
  fromSchemaKey: 'src',
  fromFieldPath: 'targetRef',
  toSchemaKey: 'tgt',
  cardinality: 'one',
  hard: false,
  ...overrides,
});

const idFor = (salt: string, key: string, i: number): string => `${salt}:${key}:${i}`;

describe('createStrategyResolver — 1:1', () => {
  it('returns target __id at the same index when no toFieldPath', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: '1:1' } as Strategy,
      edge: edge(),
      sourceCount: 3,
      targetCount: 3,
      salt: 's',
    });
    expect(resolver(0)).toBe(idFor('s', 'tgt', 0));
    expect(resolver(2)).toBe(idFor('s', 'tgt', 2));
  });

  it('throws when source.count !== target.count', async () => {
    await expect(
      createStrategyResolver({
        strategy: { type: '1:1' } as Strategy,
        edge: edge(),
        sourceCount: 3,
        targetCount: 5,
        salt: 's',
      }),
    ).rejects.toThrow(/strategy_11_count_mismatch/);
  });

  it('projects through targetProjection when toFieldPath set', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: '1:1' } as Strategy,
      edge: edge({ toFieldPath: 'email' }),
      sourceCount: 2,
      targetCount: 2,
      salt: 's',
      targetProjection: (i) => `user${i}@example.com`,
    });
    expect(resolver(0)).toBe('user0@example.com');
    expect(resolver(1)).toBe('user1@example.com');
  });
});

describe('createStrategyResolver — evenSplit', () => {
  it('cycles target ids when source > target (one)', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: 'evenSplit' } as Strategy,
      edge: edge(),
      sourceCount: 5,
      targetCount: 2,
      salt: 's',
    });
    expect(resolver(0)).toBe(idFor('s', 'tgt', 0));
    expect(resolver(1)).toBe(idFor('s', 'tgt', 1));
    expect(resolver(2)).toBe(idFor('s', 'tgt', 0));
    expect(resolver(4)).toBe(idFor('s', 'tgt', 0));
  });

  it('returns k target ids per source row (many)', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: 'evenSplit' } as Strategy,
      edge: edge({ cardinality: 'many' }),
      sourceCount: 2,
      targetCount: 6,
      salt: 's',
      many: { min: 1, max: 5 },
    });
    expect(resolver(0)).toEqual([
      idFor('s', 'tgt', 0),
      idFor('s', 'tgt', 1),
      idFor('s', 'tgt', 2),
    ]);
    expect(resolver(1)).toEqual([
      idFor('s', 'tgt', 3),
      idFor('s', 'tgt', 4),
      idFor('s', 'tgt', 5),
    ]);
  });
});

describe('createStrategyResolver — random one', () => {
  it('is deterministic for the same (salt, edge, sourceIndex)', async () => {
    const make = () =>
      createStrategyResolver({
        strategy: { type: 'random' } as Strategy,
        edge: edge(),
        sourceCount: 10,
        targetCount: 4,
        salt: 's',
      });
    const a = await make();
    const b = await make();
    for (let i = 0; i < 10; i++) {
      expect(a(i)).toBe(b(i));
    }
  });

  it('only returns ids within [0, targetCount)', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: 'random' } as Strategy,
      edge: edge(),
      sourceCount: 100,
      targetCount: 5,
      salt: 's',
    });
    const valid = new Set(Array.from({ length: 5 }, (_, j) => idFor('s', 'tgt', j)));
    for (let i = 0; i < 100; i++) {
      expect(valid.has(resolver(i) as string)).toBe(true);
    }
  });
});

describe('createStrategyResolver — random many distinct', () => {
  it('produces arrays with no duplicates and length <= min(k, targetCount)', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: 'random', allowDuplicates: false } as Strategy,
      edge: edge({ cardinality: 'many' }),
      sourceCount: 50,
      targetCount: 3,
      salt: 's',
      many: { min: 2, max: 5 },
    });
    for (let i = 0; i < 50; i++) {
      const v = resolver(i) as string[];
      expect(v.length).toBeLessThanOrEqual(3);
      expect(new Set(v).size).toBe(v.length);
    }
  });

  it('may contain duplicates when allowDuplicates is true', async () => {
    const resolver = await createStrategyResolver({
      strategy: { type: 'random', allowDuplicates: true } as Strategy,
      edge: edge({ cardinality: 'many' }),
      sourceCount: 50,
      targetCount: 2,
      salt: 's',
      many: { min: 5, max: 5 },
    });
    let sawDup = false;
    for (let i = 0; i < 50 && !sawDup; i++) {
      const v = resolver(i) as string[];
      sawDup = new Set(v).size < v.length;
    }
    expect(sawDup).toBe(true);
  });
});

// ---------- Custom strategy (Task 5) ----------

describe('createStrategyResolver — custom (one)', () => {
  it('returns the projected value from the user function result', async () => {
    const fakeSandbox = {
      invoke: async (_src: string, ctx: { sourceRows: ResolvedRow[]; targetRows: ResolvedRow[] }) =>
        ctx.sourceRows.map((_, i) => ctx.targetRows[i % ctx.targetRows.length]!.__id),
    } as unknown as SandboxPool;

    const registry = customFunctionRegistryFromMap(
      new Map([
        [
          'cfn_1234567890abcdef',
          {
            usage: 'strategy' as const,
            source: 'return ctx.sourceRows.map((_,i)=>ctx.targetRows[i].__id);',
          },
        ],
      ]),
    );

    const sourceRows: ResolvedRow[] = Array.from({ length: 3 }, (_, i) => ({
      __schemaKey: 'src',
      __id: `s:src:${i}`,
    }));
    const targetRows: ResolvedRow[] = Array.from({ length: 3 }, (_, i) => ({
      __schemaKey: 'tgt',
      __id: `s:tgt:${i}`,
    }));

    const resolver = await createStrategyResolver({
      strategy: { type: 'custom', functionId: 'cfn_1234567890abcdef' } as Strategy,
      edge: edge(),
      sourceCount: 3,
      targetCount: 3,
      sourceRows,
      targetRows,
      salt: 's',
      customFunctions: registry,
      sandbox: fakeSandbox,
    });

    expect(resolver(0)).toBe('s:tgt:0');
    expect(resolver(1)).toBe('s:tgt:1');
    expect(resolver(2)).toBe('s:tgt:2');
  });

  it('throws fn_target_missing when functionId is unknown', async () => {
    const fakeSandbox = { invoke: async () => [] } as unknown as SandboxPool;
    const registry = customFunctionRegistryFromMap(new Map());
    await expect(
      createStrategyResolver({
        strategy: { type: 'custom', functionId: 'cfn_does_not_exist00' } as Strategy,
        edge: edge(),
        sourceCount: 1,
        targetCount: 1,
        sourceRows: [{ __schemaKey: 'src', __id: 's:src:0' }],
        targetRows: [{ __schemaKey: 'tgt', __id: 's:tgt:0' }],
        salt: 's',
        customFunctions: registry,
        sandbox: fakeSandbox,
      }),
    ).rejects.toThrow(/fn_target_missing/);
  });
});
