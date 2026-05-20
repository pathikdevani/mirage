import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import { generateRows } from '../generate-rows.js';
import { resolveSchema } from '../resolve-schema.js';
import { customFunctionRegistryFromMap } from '../custom-function-registry.js';

type Schema = Api.components['schemas']['Schema'];

const schema = (props: Api.components['schemas']['SchemaProp'][]): Schema =>
  ({
    id: 'sch_x',
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key: 'x',
    name: 'x',
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    properties: props,
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as Schema;

const fakeSandbox = { invoke: async () => null } as unknown as SandboxPool;

describe('generateRows', () => {
  it('produces the same rows as resolveSchema for the same inputs', async () => {
    const sch = schema([
      { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      { name: 'name', type: 'string', faker: 'person.firstName', required: false },
    ]);
    const params = {
      schema: sch,
      count: 4,
      salt: 'salt',
      locale: 'en',
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
    };
    const fromIterator: unknown[] = [];
    for await (const row of generateRows(params)) fromIterator.push(row);
    const fromArray = await resolveSchema(params);
    expect(fromIterator).toEqual(fromArray);
  });

  it('yields exactly count rows', async () => {
    const sch = schema([{ name: 'id', type: 'string', faker: 'string.uuid', required: false }]);
    const params = {
      schema: sch,
      count: 7,
      salt: 'salt',
      locale: 'en',
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
    };
    let n = 0;
    for await (const _row of generateRows(params)) n++;
    expect(n).toBe(7);
  });

  it('emits __id with the salt:schemaKey:index pattern', async () => {
    const sch = schema([{ name: 'id', type: 'string', faker: 'string.uuid', required: false }]);
    const ids: string[] = [];
    for await (const row of generateRows({
      schema: sch,
      count: 3,
      salt: 'S',
      locale: 'en',
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
    })) {
      ids.push(row.__id);
    }
    expect(ids).toEqual(['S:x:0', 'S:x:1', 'S:x:2']);
  });
});
