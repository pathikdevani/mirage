import { describe, it, expect } from 'vitest';
import type { MethodEntry } from '@mirage/fakerjs';
import type { ValueExpr } from '@mirage/types';
import { toInternal, toStored, isValueExpr, exprAsLiteral } from '../serialize.js';

const optionsEntry: MethodEntry = {
  shape: 'options',
  params: [
    { name: 'min', kind: 'number', label: 'min' },
    { name: 'max', kind: 'number', label: 'max' },
  ],
};
const positionalEntry: MethodEntry = {
  shape: 'positional',
  params: [
    { name: 'sex', kind: 'enum', label: 'sex', options: ['female', 'male'] },
  ],
};

const expr = (text: string): ValueExpr => [{ kind: 'text', text }];

describe('toInternal/toStored', () => {
  it('lifts legacy literal options into ValueExpr', () => {
    const internal = toInternal(optionsEntry, { min: 10, max: 20 });
    expect(internal['min']).toEqual(expr('10'));
    expect(internal['max']).toEqual(expr('20'));
  });

  it('round-trips ValueExpr options as-is', () => {
    const stored = { min: expr('5'), max: expr('100') };
    expect(toStored(optionsEntry, toInternal(optionsEntry, stored))).toEqual(stored);
  });

  it('round-trips legacy positional shape via ValueExpr', () => {
    const internal = toInternal(positionalEntry, ['female']);
    expect(internal['sex']).toEqual(expr('female'));
    expect(toStored(positionalEntry, internal)).toEqual([expr('female')]);
  });

  it('returns undefined when nothing is set', () => {
    expect(toStored(optionsEntry, {})).toBeUndefined();
    expect(toStored(optionsEntry, { min: undefined })).toBeUndefined();
  });

  it('trims trailing undefined in positional', () => {
    const entry: MethodEntry = {
      shape: 'positional',
      params: [
        { name: 'a', kind: 'string', label: 'a' },
        { name: 'b', kind: 'string', label: 'b' },
      ],
    };
    expect(toStored(entry, { a: expr('x') })).toEqual([expr('x')]);
  });

  it('returns undefined for shape "none"', () => {
    const none: MethodEntry = { shape: 'none', params: [] };
    expect(toStored(none, { foo: expr('bar') })).toBeUndefined();
  });

  it('preserves sibling-field ValueExpr in args', () => {
    const fieldExpr: ValueExpr = [{ kind: 'field', name: 'fname' }];
    const stored = toStored(optionsEntry, { min: fieldExpr });
    expect(stored).toEqual({ min: fieldExpr });
  });

  it('lifts a legacy literal string array for array params', () => {
    const arrayEntry: MethodEntry = {
      shape: 'options',
      params: [{ name: 'list', kind: 'array', label: 'list' }],
    };
    const internal = toInternal(arrayEntry, { list: ['a', 'b'] });
    expect(internal['list']).toEqual([expr('a'), expr('b')]);
  });
});

describe('isValueExpr', () => {
  it('returns true for non-empty arrays of segments', () => {
    expect(isValueExpr([{ kind: 'text', text: 'x' }])).toBe(true);
    expect(isValueExpr([{ kind: 'field', name: 'fname' }])).toBe(true);
  });
  it('returns false for literal arrays', () => {
    expect(isValueExpr(['a', 'b'])).toBe(false);
    expect(isValueExpr([1, 2])).toBe(false);
  });
  it('returns false for empty arrays and non-arrays', () => {
    expect(isValueExpr([])).toBe(false);
    expect(isValueExpr('string')).toBe(false);
    expect(isValueExpr(undefined)).toBe(false);
  });
});

describe('exprAsLiteral', () => {
  it('returns the text of a single text segment', () => {
    expect(exprAsLiteral(expr('hello'))).toBe('hello');
  });
  it('returns undefined for non-literal exprs', () => {
    expect(exprAsLiteral([{ kind: 'field', name: 'x' }])).toBeUndefined();
    expect(exprAsLiteral([{ kind: 'text', text: 'a' }, { kind: 'text', text: 'b' }])).toBeUndefined();
    expect(exprAsLiteral(undefined)).toBeUndefined();
  });
});
