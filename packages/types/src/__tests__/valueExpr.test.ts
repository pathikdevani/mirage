import { describe, it, expect } from 'vitest';
import {
  canonicalize,
  isPureMethod,
  isPureRef,
  isPureFn,
  extractFieldRefs,
  extractCrossSchemaRefs,
  extractFnIds,
  extractMethods,
  type ValueExpr,
} from '../valueExpr.js';

describe('canonicalize', () => {
  it('coalesces adjacent text segments', () => {
    const v: ValueExpr = [
      { kind: 'text', text: 'a' },
      { kind: 'text', text: 'b' },
      { kind: 'field', name: 'x' },
      { kind: 'text', text: 'c' },
      { kind: 'text', text: 'd' },
    ];
    expect(canonicalize(v)).toEqual([
      { kind: 'text', text: 'ab' },
      { kind: 'field', name: 'x' },
      { kind: 'text', text: 'cd' },
    ]);
  });

  it('drops empty text segments', () => {
    const v: ValueExpr = [
      { kind: 'text', text: '' },
      { kind: 'field', name: 'x' },
    ];
    expect(canonicalize(v)).toEqual([{ kind: 'field', name: 'x' }]);
  });

  it('returns the original when already canonical', () => {
    const v: ValueExpr = [{ kind: 'field', name: 'x' }];
    expect(canonicalize(v)).toEqual(v);
  });
});

describe('isPure* predicates', () => {
  it('identifies a pure method', () => {
    expect(isPureMethod([{ kind: 'method', method: 'internet.email' }])).toBe(true);
    expect(
      isPureMethod([
        { kind: 'method', method: 'internet.email' },
        { kind: 'text', text: 'x' },
      ]),
    ).toBe(false);
    expect(isPureMethod([{ kind: 'text', text: 'x' }])).toBe(false);
  });

  it('identifies a pure ref', () => {
    expect(isPureRef([{ kind: 'ref', target: 'user.email' }])).toBe(true);
    expect(isPureRef([{ kind: 'text', text: 'x' }])).toBe(false);
  });

  it('identifies a pure fn', () => {
    expect(isPureFn([{ kind: 'fn', id: 'abc' }])).toBe(true);
    expect(isPureFn([{ kind: 'text', text: 'x' }])).toBe(false);
  });
});

describe('extractors', () => {
  const v: ValueExpr = [
    { kind: 'text', text: 'Hi ' },
    { kind: 'field', name: 'fname' },
    { kind: 'text', text: ' ' },
    { kind: 'method', method: 'internet.email' },
    { kind: 'ref', target: 'user.email' },
    { kind: 'fn', id: 'abc' },
  ];

  it('extracts field names', () => {
    expect(extractFieldRefs(v)).toEqual(['fname']);
  });

  it('extracts cross-schema ref targets', () => {
    expect(extractCrossSchemaRefs(v)).toEqual(['user.email']);
  });

  it('extracts fn ids', () => {
    expect(extractFnIds(v)).toEqual(['abc']);
  });

  it('extracts method segments', () => {
    expect(extractMethods(v)).toEqual([{ method: 'internet.email' }]);
  });

  it('extracts method segment args when present', () => {
    const withArgs: ValueExpr = [
      { kind: 'method', method: 'number.int', args: { min: 1, max: 9 } },
    ];
    expect(extractMethods(withArgs)).toEqual([
      { method: 'number.int', args: { min: 1, max: 9 } },
    ]);
  });
});
