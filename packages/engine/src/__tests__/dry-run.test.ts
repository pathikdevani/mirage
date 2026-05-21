import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import { dryRunSchema } from '../dry-run.js';
import { customFunctionRegistryFromMap } from '../custom-function-registry.js';

type Schema = Api.components['schemas']['Schema'];

const schema = (key: string, props: Api.components['schemas']['SchemaProp'][]): Schema =>
  ({
    id: `sch_${key}`,
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key,
    name: key,
    description: '',
    color: 'violet',
    icon: 'database',
    tags: [],
    properties: props,
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as Schema;

const fakeSandbox = { invoke: async () => null } as unknown as SandboxPool;

describe('dryRunSchema', () => {
  it('generates the requested number of rows for the main schema', async () => {
    const draft = schema('user', [
      { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      { name: 'name', type: 'string', faker: 'person.firstName', required: false },
    ]);
    const result = await dryRunSchema({
      draft,
      referencedSchemas: new Map(),
      count: 3,
      salt: 'preview',
      locale: 'en',
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
    });
    expect(result.rows).toHaveLength(3);
    expect(result.refs).toEqual({});
    expect(typeof (result.rows[0] as Record<string, unknown>)['id']).toBe('string');
  });

  it('generates ref rows and substitutes them into the main rows', async () => {
    const orgSchema = schema('org', [
      { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      { name: 'name', type: 'string', faker: 'company.name', required: false },
    ]);
    const draft = schema('user', [
      { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      { name: 'orgId', type: 'string', faker: '$ref:org.id', required: false },
    ]);
    const result = await dryRunSchema({
      draft,
      referencedSchemas: new Map([['org', orgSchema]]),
      count: 2,
      salt: 'preview',
      locale: 'en',
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
    });
    expect(result.rows).toHaveLength(2);
    expect(result.refs['org']).toHaveLength(2);
    const orgIds = (result.refs['org'] as Array<Record<string, unknown>>).map((r) => r['id']);
    const userOrgIds = (result.rows as Array<Record<string, unknown>>).map((r) => r['orgId']);
    expect(userOrgIds).toEqual(orgIds);
  });

  it('leaves fields as null when ref target is missing from referencedSchemas', async () => {
    const draft = schema('user', [
      { name: 'id', type: 'string', faker: 'string.uuid', required: false },
      { name: 'orgId', type: 'string', faker: '$ref:org.id', required: false },
    ]);
    const result = await dryRunSchema({
      draft,
      referencedSchemas: new Map(),
      count: 1,
      salt: 'preview',
      locale: 'en',
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.refs).toEqual({});
    expect((result.rows[0] as Record<string, unknown>)['orgId']).toBeNull();
  });
});
