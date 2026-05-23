import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import { generateRows } from '../generate-rows.js';
import { resolveSchema } from '../resolve-schema.js';
import { customFunctionRegistryFromMap } from '../custom-function-registry.js';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

const schema = (props: SchemaProp[]): Schema =>
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

const params = (sch: Schema, count = 1) => ({
  schema: sch,
  count,
  salt: 'salt',
  locale: 'en',
  customFunctions: customFunctionRegistryFromMap(new Map()),
  sandbox: fakeSandbox,
});

const drain = async (sch: Schema, count = 1): Promise<Record<string, unknown>[]> => {
  const out: Record<string, unknown>[] = [];
  for await (const r of generateRows(params(sch, count))) out.push(r as Record<string, unknown>);
  return out;
};

describe('generateRows', () => {
  it('produces the same rows as resolveSchema for the same inputs', async () => {
    const sch = schema([
      { name: 'id', type: 'string', required: false, value: [{ kind: 'method', method: 'string.uuid' }] },
      { name: 'name', type: 'string', required: false, value: [{ kind: 'method', method: 'person.firstName' }] },
    ]);
    const fromIterator: unknown[] = [];
    for await (const row of generateRows(params(sch, 4))) fromIterator.push(row);
    const fromArray = await resolveSchema(params(sch, 4));
    expect(fromIterator).toEqual(fromArray);
  });

  it('yields exactly count rows', async () => {
    const sch = schema([
      { name: 'id', type: 'string', required: false, value: [{ kind: 'method', method: 'string.uuid' }] },
    ]);
    let n = 0;
    for await (const _row of generateRows(params(sch, 7))) n++;
    expect(n).toBe(7);
  });

  it('forwards method-segment args to the faker method', async () => {
    const sch = schema([
      {
        name: 'price',
        type: 'number',
        required: false,
        value: [{ kind: 'method', method: 'commerce.price', args: { min: 50, max: 60 } }],
      },
    ]);
    for await (const row of generateRows(params(sch, 20))) {
      const n = parseFloat((row as Record<string, string>)['price']!);
      expect(n).toBeGreaterThanOrEqual(50);
      expect(n).toBeLessThanOrEqual(60);
    }
  });

  it('resolves a ValueExpr arg that references a sibling field before calling faker', async () => {
    // `internet.email` takes firstName/lastName as args; here both are
    // ValueExprs that point at sibling fields, so the engine must evaluate
    // the siblings first and pass their string values to faker.
    const sch = schema([
      { name: 'fname', type: 'string', required: true, value: [{ kind: 'text', text: 'Ada' }] },
      { name: 'lname', type: 'string', required: true, value: [{ kind: 'text', text: 'Lovelace' }] },
      {
        name: 'email',
        type: 'string',
        required: true,
        value: [
          {
            kind: 'method',
            method: 'internet.email',
            args: {
              firstName: [{ kind: 'field', name: 'fname' }],
              lastName: [{ kind: 'field', name: 'lname' }],
              provider: [{ kind: 'text', text: 'example.org' }],
            },
          },
        ],
      },
    ]);
    const [row] = await drain(sch);
    const email = String(row!['email']);
    // faker may transform/casefold, but the firstName + lastName + provider
    // we pipe in must appear; the literal {{fname}}-style template would
    // never satisfy this.
    expect(email.toLowerCase()).toContain('ada');
    expect(email.toLowerCase()).toContain('lovelace');
    expect(email.endsWith('@example.org')).toBe(true);
  });

  it('resolves a ValueExpr arg whose value is an inline faker call', async () => {
    // `min` here is a nested faker call: `number.int({ min: 5, max: 5 })`
    // → 5. The outer call then becomes `number.int({ min: 5, max: 5 })`.
    const sch = schema([
      {
        name: 'n',
        type: 'integer',
        required: true,
        value: [
          {
            kind: 'method',
            method: 'number.int',
            args: {
              min: [
                { kind: 'method', method: 'number.int', args: { min: 5, max: 5 } },
              ],
              max: [
                { kind: 'method', method: 'number.int', args: { min: 5, max: 5 } },
              ],
            },
          },
        ],
      },
    ]);
    const [row] = await drain(sch);
    expect(row!['n']).toBe(5);
  });

  it('legacy literal args still flow through unchanged', async () => {
    // Old schemas store `{ min: 50, max: 60 }` directly (not ValueExprs).
    // The engine must pass these through so persisted data keeps working.
    const sch = schema([
      {
        name: 'price',
        type: 'number',
        required: false,
        value: [
          { kind: 'method', method: 'commerce.price', args: { min: 50, max: 60 } },
        ],
      },
    ]);
    for await (const row of generateRows(params(sch, 10))) {
      const n = parseFloat((row as Record<string, string>)['price']!);
      expect(n).toBeGreaterThanOrEqual(50);
      expect(n).toBeLessThanOrEqual(60);
    }
  });

  it('emits __id with the salt:schemaKey:index pattern', async () => {
    const sch = schema([
      { name: 'id', type: 'string', required: false, value: [{ kind: 'method', method: 'string.uuid' }] },
    ]);
    const ids: string[] = [];
    for await (const row of generateRows({
      ...params(sch, 3),
      salt: 'S',
    })) {
      ids.push(row.__id);
    }
    expect(ids).toEqual(['S:x:0', 'S:x:1', 'S:x:2']);
  });
});

describe('value-template evaluation', () => {
  it('a single text segment returns the literal', async () => {
    const sch = schema([
      { name: 'fixed', type: 'string', required: true, value: [{ kind: 'text', text: 'hello' }] },
    ]);
    const [row] = await drain(sch);
    expect(row!['fixed']).toBe('hello');
  });

  it('a single method segment preserves the native type', async () => {
    const sch = schema([
      {
        name: 'n',
        type: 'integer',
        required: true,
        value: [{ kind: 'method', method: 'number.int', args: { min: 1, max: 1 } }],
      },
    ]);
    const [row] = await drain(sch);
    expect(row!['n']).toBe(1);
  });

  it('multi-segment templates stringify and concatenate', async () => {
    const sch = schema([
      { name: 'fname', type: 'string', required: true, value: [{ kind: 'text', text: 'Ada' }] },
      { name: 'lname', type: 'string', required: true, value: [{ kind: 'text', text: 'Lovelace' }] },
      {
        name: 'email',
        type: 'string',
        required: true,
        value: [
          { kind: 'field', name: 'fname' },
          { kind: 'text', text: '.' },
          { kind: 'field', name: 'lname' },
          { kind: 'text', text: '@acme.com' },
        ],
      },
    ]);
    const [row] = await drain(sch);
    expect(row!['email']).toBe('Ada.Lovelace@acme.com');
  });

  it('dotted field paths resolve nested object siblings', async () => {
    const sch = schema([
      {
        name: 'address',
        type: 'object',
        required: true,
        fields: [
          { name: 'city', type: 'string', required: true, value: [{ kind: 'text', text: 'Paris' }] },
        ],
      },
      {
        name: 'city2',
        type: 'string',
        required: true,
        value: [{ kind: 'field', name: 'address.city' }],
      },
    ]);
    const [row] = await drain(sch);
    expect(row!['city2']).toBe('Paris');
  });

  it('null/undefined field values coerce to empty string in multi-segment templates', async () => {
    const sch = schema([
      { name: 'missing', type: 'string', required: false },
      {
        name: 'greeting',
        type: 'string',
        required: true,
        value: [
          { kind: 'text', text: 'Hi ' },
          { kind: 'field', name: 'missing' },
          { kind: 'text', text: '!' },
        ],
      },
    ]);
    const [row] = await drain(sch);
    expect(row!['greeting']).toBe('Hi !');
  });

  it('throws value_cycle on a 2-field cycle', async () => {
    const sch = schema([
      { name: 'a', type: 'string', required: true, value: [{ kind: 'field', name: 'b' }] },
      { name: 'b', type: 'string', required: true, value: [{ kind: 'field', name: 'a' }] },
    ]);
    await expect(drain(sch)).rejects.toThrow(/value_cycle/);
  });

  it('value_cycle detail carries method[arg] hops when field refs live in method args', async () => {
    const sch = schema([
      {
        name: 'email',
        type: 'string',
        required: false,
        value: [
          {
            kind: 'method',
            method: 'internet.email',
            args: { firstName: [{ kind: 'field', name: 'email_faker' }] },
          },
        ],
      },
      {
        name: 'email_faker',
        type: 'string',
        required: false,
        value: [
          {
            kind: 'method',
            method: 'internet.email',
            args: { firstName: [{ kind: 'field', name: 'email' }] },
          },
        ],
      },
    ]);
    const err = await drain(sch).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeTruthy();
    const detail = (err as { detail?: { hops?: unknown } }).detail;
    expect(detail).toMatchObject({
      hops: [
        {
          from: 'email',
          to: 'email_faker',
          via: { kind: 'method_arg', method: 'internet.email', arg: 'firstName' },
        },
        {
          from: 'email_faker',
          to: 'email',
          via: { kind: 'method_arg', method: 'internet.email', arg: 'firstName' },
        },
      ],
    });
  });

  it('value_cycle hop via is null for plain top-level field refs', async () => {
    const sch = schema([
      { name: 'a', type: 'string', required: false, value: [{ kind: 'field', name: 'b' }] },
      { name: 'b', type: 'string', required: false, value: [{ kind: 'field', name: 'a' }] },
    ]);
    const err = await drain(sch).then(
      () => null,
      (e: unknown) => e,
    );
    const detail = (err as { detail?: { hops?: Array<{ via: unknown }> } }).detail;
    expect(detail?.hops?.[0]?.via).toBeNull();
    expect(detail?.hops?.[1]?.via).toBeNull();
  });

  it('returns null when value is undefined', async () => {
    const sch = schema([{ name: 'x', type: 'string', required: false }]);
    const [row] = await drain(sch);
    expect(row!['x']).toBeNull();
  });
});
