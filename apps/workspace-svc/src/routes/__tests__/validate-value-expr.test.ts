import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import { validateValueExpr } from '../validate-value-expr.js';

type SchemaProp = Api.components['schemas']['SchemaProp'];

const prop = (overrides: Partial<SchemaProp>): SchemaProp => ({
  name: 'x',
  type: 'string',
  required: false,
  ...overrides,
});

describe('validateValueExpr', () => {
  it('accepts a property with no value (undefined is fine)', () => {
    expect(validateValueExpr(prop({}))).toBeNull();
  });

  it('accepts a pure-method value', () => {
    expect(
      validateValueExpr(
        prop({ value: [{ kind: 'method', method: 'internet.email' }] }),
      ),
    ).toBeNull();
  });

  it('rejects an empty value array', () => {
    expect(validateValueExpr(prop({ value: [] }))!.code).toBe('value_empty');
  });

  it('rejects an unknown faker method', () => {
    expect(
      validateValueExpr(
        prop({ value: [{ kind: 'method', method: 'nope.unknown' }] }),
      )!.code,
    ).toBe('value_method_unknown');
  });

  it('accepts a mixed template', () => {
    expect(
      validateValueExpr(
        prop({
          value: [
            { kind: 'field', name: 'fname' },
            { kind: 'text', text: '.' },
            { kind: 'field', name: 'lname' },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('rejects method args that are neither object nor array', () => {
    expect(
      validateValueExpr(
        prop({
          value: [
            { kind: 'method', method: 'number.int', args: 'bogus' as unknown as never },
          ],
        }),
      )!.code,
    ).toBe('value_args_invalid_shape');
  });

  it('accepts segment combinations of every kind', () => {
    expect(
      validateValueExpr(
        prop({
          value: [
            { kind: 'text', text: 'Hi ' },
            { kind: 'field', name: 'fname' },
            { kind: 'method', method: 'internet.email', args: { provider: 'a' } },
            { kind: 'ref', target: 'user.email' },
            { kind: 'fn', id: 'cfn_AAAAAAAAAAAAAAAA' },
          ],
        }),
      ),
    ).toBeNull();
  });
});
