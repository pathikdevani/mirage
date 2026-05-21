import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import { runSetStream } from '../run-set-stream.js';
import { customFunctionRegistryFromMap } from '../custom-function-registry.js';

type Schema = Api.components['schemas']['Schema'];
type MirageSet = Api.components['schemas']['Set'];

const fakeSandbox = { invoke: async () => null } as unknown as SandboxPool;

const schema = (key: string, props: Api.components['schemas']['SchemaProp'][]): Schema =>
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
    properties: props,
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as Schema;

const buildSet = (
  schemas: { schemaKey: string; count: number }[],
  strategies: Api.components['schemas']['StrategyOverride'][] = [],
): MirageSet =>
  ({
    id: 'set_1',
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key: 'k',
    name: 'k',
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    salt: 'S',
    schemas,
    strategies,
    output: { format: 'ndjson', locale: 'en', workerPool: 1 },
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as MirageSet;

describe('runSetStream — single schema', () => {
  it('yields batches with the right totals', async () => {
    const schemas = [
      schema('a', [{ name: 'id', type: 'string', faker: 'string.uuid', required: false }]),
    ];
    const set = buildSet([{ schemaKey: 'a', count: 7 }]);
    const batches = [];
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
      batchSize: 3,
    })) {
      batches.push(b);
    }
    expect(batches.map((b) => b.rows.length)).toEqual([3, 3, 1]);
    expect(batches.at(-1)!.totalProduced).toBe(7);
    expect(batches.at(-1)!.totalRows).toBe(7);
    expect(batches.every((b) => b.schemaKey === 'a')).toBe(true);
  });
});

describe('runSetStream — cross-schema refs', () => {
  it('substitutes a 1:1 reference with the target __id when no toFieldPath', async () => {
    const schemas = [
      schema('person', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      ]),
      schema('mobile', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
        { name: 'personId', type: 'string', faker: '$ref:person', required: false },
      ]),
    ];
    const set = buildSet([
      { schemaKey: 'person', count: 3 },
      { schemaKey: 'mobile', count: 3 },
    ]);
    const rowsByKey = new Map<string, unknown[]>();
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
      batchSize: 2,
    })) {
      const acc = rowsByKey.get(b.schemaKey) ?? [];
      acc.push(...b.rows);
      rowsByKey.set(b.schemaKey, acc);
    }
    const mobiles = rowsByKey.get('mobile') as Array<{ personId: string }>;
    expect(mobiles.map((m) => m.personId)).toEqual(['S:person:0', 'S:person:1', 'S:person:2']);
  });

  it('projects through toFieldPath when set', async () => {
    const schemas = [
      schema('person', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
        { name: 'email', type: 'string', faker: 'internet.email', required: false },
      ]),
      schema('mobile', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
        { name: 'personEmail', type: 'string', faker: '$ref:person.email', required: false },
      ]),
    ];
    const set = buildSet([
      { schemaKey: 'person', count: 2 },
      { schemaKey: 'mobile', count: 2 },
    ]);
    let persons: Array<{ email: string }> = [];
    let mobiles: Array<{ personEmail: string }> = [];
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
      batchSize: 10,
    })) {
      if (b.schemaKey === 'person') persons = b.rows as unknown as Array<{ email: string }>;
      if (b.schemaKey === 'mobile') mobiles = b.rows as unknown as Array<{ personEmail: string }>;
    }
    expect(mobiles[0]!.personEmail).toBe(persons[0]!.email);
    expect(mobiles[1]!.personEmail).toBe(persons[1]!.email);
  });
});

describe('runSetStream — soft cycles', () => {
  it('generates Phone and Person with cross-pointing UUIDs', async () => {
    const schemas = [
      schema('phone', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
        { name: 'person_id', type: 'string', faker: '$ref:person.id', required: false },
      ]),
      schema('person', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
        { name: 'phone_id', type: 'string', faker: '$ref:phone.id', required: false },
      ]),
    ];
    const set = buildSet([
      { schemaKey: 'phone', count: 3 },
      { schemaKey: 'person', count: 3 },
    ]);

    const rowsByKey = new Map<string, unknown[]>();
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
      batchSize: 10,
    })) {
      const acc = rowsByKey.get(b.schemaKey) ?? [];
      acc.push(...b.rows);
      rowsByKey.set(b.schemaKey, acc);
    }

    const phoneRows = rowsByKey.get('phone') as Array<{ id: string; person_id: string }>;
    const personRows = rowsByKey.get('person') as Array<{ id: string; phone_id: string }>;
    expect(phoneRows).toHaveLength(3);
    expect(personRows).toHaveLength(3);

    const personIds = new Set(personRows.map((r) => r.id));
    const phoneIds = new Set(phoneRows.map((r) => r.id));
    for (const r of phoneRows) {
      expect(personIds.has(r.person_id)).toBe(true);
    }
    for (const r of personRows) {
      expect(phoneIds.has(r.phone_id)).toBe(true);
    }
  });
});

describe('runSetStream — self-references', () => {
  it('resolves a soft self-ref to a sibling row (single-schema soft cycle)', async () => {
    const schemas = [
      schema('mobile', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
        { name: 'person_id', type: 'string', faker: '$ref:mobile.id', required: false },
      ]),
    ];
    const set = buildSet([{ schemaKey: 'mobile', count: 3 }]);

    const rows: Array<{ id: string; person_id: string }> = [];
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
      batchSize: 10,
    })) {
      rows.push(...(b.rows as unknown as Array<{ id: string; person_id: string }>));
    }

    expect(rows).toHaveLength(3);
    const ids = new Set(rows.map((r) => r.id));
    for (const r of rows) {
      expect(typeof r.person_id).toBe('string');
      expect(ids.has(r.person_id)).toBe(true);
    }
  });

  it('resolves a chain of self-refs (a → b → c) within one schema', async () => {
    const schemas = [
      schema('mobile', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
        { name: 'person_id', type: 'string', faker: '$ref:mobile.id', required: false },
        { name: 'internal_id', type: 'string', faker: '$ref:mobile.person_id', required: false },
      ]),
    ];
    const set = buildSet([{ schemaKey: 'mobile', count: 3 }]);

    const rows: Array<{ id: string; person_id: string; internal_id: string }> = [];
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
      batchSize: 10,
    })) {
      rows.push(
        ...(b.rows as unknown as Array<{
          id: string;
          person_id: string;
          internal_id: string;
        }>),
      );
    }

    const ids = new Set(rows.map((r) => r.id));
    for (const r of rows) {
      expect(typeof r.internal_id).toBe('string');
      expect(ids.has(r.internal_id)).toBe(true);
    }
  });

  it('resolves a self-soft-cycle with random strategy projecting an out-of-group ref field', async () => {
    // Same shape as the test below, but the in-group edge uses `random`
    // instead of the implicit `1:1`. With random, the resolver picks any
    // target index — including ones whose own out-of-group $ref hasn't
    // been substituted yet under naïve in-order processing — so the fix
    // must fully resolve out-of-group fields before in-group projection
    // reads start happening.
    const schemas = [
      schema('person', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      ]),
      schema('mobile', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
        { name: 'person_id', type: 'string', faker: '$ref:person.id', required: false },
        { name: 'internal_id', type: 'string', faker: '$ref:mobile.person_id', required: false },
      ]),
    ];
    const set = buildSet(
      [
        { schemaKey: 'person', count: 10 },
        { schemaKey: 'mobile', count: 10 },
      ],
      [
        {
          schemaKey: 'mobile',
          fieldPath: 'internal_id',
          strategy: { type: 'random', allowDuplicates: true },
        },
      ],
    );

    const rows: Array<{ id: string; person_id: unknown; internal_id: unknown }> = [];
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
      batchSize: 10,
    })) {
      if (b.schemaKey !== 'mobile') continue;
      rows.push(
        ...(b.rows as unknown as Array<{
          id: string;
          person_id: unknown;
          internal_id: unknown;
        }>),
      );
    }

    expect(rows).toHaveLength(10);
    const personIdSet = new Set(rows.map((r) => r.person_id as string));
    for (const r of rows) {
      expect(typeof r.person_id).toBe('string');
      expect(typeof r.internal_id).toBe('string');
      expect(personIdSet.has(r.internal_id as string)).toBe(true);
    }
  });

  it('resolves a self-soft-cycle field that projects an out-of-group ref field', async () => {
    // Reproduces the bug where mobile.internal_id projects mobile.person_id,
    // but mobile.person_id is itself a cross-schema $ref. The seed pass for
    // mobile's self-soft-cycle copied the unresolved RefPlaceholder for
    // person_id into projectedColumns, and the main loop never refreshed
    // that column after substituting person_id — so internal_id ended up
    // holding the stale placeholder.
    const schemas = [
      schema('person', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      ]),
      schema('mobile', [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
        { name: 'person_id', type: 'string', faker: '$ref:person.id', required: false },
        { name: 'internal_id', type: 'string', faker: '$ref:mobile.person_id', required: false },
      ]),
    ];
    const set = buildSet([
      { schemaKey: 'person', count: 3 },
      { schemaKey: 'mobile', count: 3 },
    ]);

    const rows: Array<{ id: string; person_id: unknown; internal_id: unknown }> = [];
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
      batchSize: 10,
    })) {
      if (b.schemaKey !== 'mobile') continue;
      rows.push(
        ...(b.rows as unknown as Array<{
          id: string;
          person_id: unknown;
          internal_id: unknown;
        }>),
      );
    }

    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(typeof r.person_id).toBe('string');
      expect(typeof r.internal_id).toBe('string');
      expect(r.internal_id).toBe(r.person_id);
    }
  });
});

describe('runSetStream — cancellation', () => {
  it('throws CancelledError when signal is aborted between batches', async () => {
    const schemas = [
      schema('a', [{ name: 'id', type: 'string', faker: 'string.uuid', required: false }]),
    ];
    const set = buildSet([{ schemaKey: 'a', count: 10 }]);
    const controller = new AbortController();
    const it = runSetStream({
      set,
      schemas,
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
      batchSize: 3,
      signal: controller.signal,
    })[Symbol.asyncIterator]();
    const first = await it.next();
    expect(first.done).toBe(false);
    controller.abort();
    await expect(it.next()).rejects.toBeInstanceOf(Error);
  });
});
