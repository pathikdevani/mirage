import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import { validateFakerArgs } from '../validate-faker-args.js';

type SchemaProp = Api.components['schemas']['SchemaProp'];

const base: SchemaProp = {
  name: 'price',
  type: 'number',
  required: false,
  faker: 'commerce.price',
};

describe('validateFakerArgs', () => {
  it('accepts well-formed fakerArgs', () => {
    const p: SchemaProp = { ...base, fakerArgs: { min: 10, max: 100 } } as SchemaProp;
    expect(validateFakerArgs(p)).toBeNull();
  });

  it('accepts undefined fakerArgs', () => {
    expect(validateFakerArgs(base)).toBeNull();
  });

  it('rejects fakerArgs when faker is unset', () => {
    const p = {
      name: 'price',
      type: 'number',
      required: false,
      fakerArgs: { min: 10 },
    } as unknown as SchemaProp;
    const r = validateFakerArgs(p);
    expect(r?.code).toBe('faker_args_without_faker');
  });

  it('rejects fakerArgs when faker is a $ref', () => {
    const p = { ...base, faker: '$ref:other.field', fakerArgs: { min: 10 } } as SchemaProp;
    const r = validateFakerArgs(p);
    expect(r?.code).toBe('faker_args_not_supported');
  });

  it('rejects fakerArgs when faker is a $fn', () => {
    const p = { ...base, faker: '$fn:cfn_1234567890abcdef', fakerArgs: { min: 10 } } as SchemaProp;
    const r = validateFakerArgs(p);
    expect(r?.code).toBe('faker_args_not_supported');
  });

  it('rejects fakerArgs of invalid shape', () => {
    const p = { ...base, fakerArgs: 'not an object' } as unknown as SchemaProp;
    const r = validateFakerArgs(p);
    expect(r?.code).toBe('faker_args_invalid_shape');
  });

  it('rejects fakerArgs larger than 4 KB', () => {
    const big = { padding: 'x'.repeat(5000) };
    const p = { ...base, fakerArgs: big } as SchemaProp;
    const r = validateFakerArgs(p);
    expect(r?.code).toBe('faker_args_too_large');
  });
});
