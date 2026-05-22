import { describe, it, expect } from 'vitest';
import { validateTree } from '../validateTree.js';
import type { SchemaProp } from '../types.js';
import type { ValueExpr } from '@mirage/types';

const row = (overrides: Partial<SchemaProp>): SchemaProp =>
  ({ name: 'x', type: 'string', required: false, ...overrides }) as SchemaProp;

const v = (expr: ValueExpr): ValueExpr => expr;

describe('validateTree — field segment validation', () => {
  const keys = new Set(['user']);

  it('passes when value is undefined', () => {
    expect(validateTree([row({ name: 'x' })], keys)).toEqual([]);
  });

  it('flags missing sibling field ref', () => {
    const rows = [row({ name: 'email', value: v([{ kind: 'field', name: 'ghost' }]) })];
    expect(validateTree(rows, keys)).toEqual([
      { kind: 'tpl_field_missing', path: 'email', target: 'ghost' },
    ]);
  });

  it('flags container field ref without dotted path', () => {
    const rows = [
      row({ name: 'addr', type: 'object', fields: [row({ name: 'city' })] }),
      row({ name: 'email', value: v([{ kind: 'field', name: 'addr' }]) }),
    ];
    expect(validateTree(rows, keys)).toContainEqual({
      kind: 'tpl_field_container',
      path: 'email',
      target: 'addr',
    });
  });

  it('resolves a dotted path into a nested object', () => {
    const rows = [
      row({ name: 'addr', type: 'object', fields: [row({ name: 'city' })] }),
      row({ name: 'email', value: v([{ kind: 'field', name: 'addr.city' }]) }),
    ];
    expect(validateTree(rows, keys)).toEqual([]);
  });

  it('flags a dotted path that does not resolve', () => {
    const rows = [
      row({ name: 'addr', type: 'object', fields: [row({ name: 'city' })] }),
      row({ name: 'email', value: v([{ kind: 'field', name: 'addr.nope' }]) }),
    ];
    expect(validateTree(rows, keys)).toContainEqual({
      kind: 'tpl_field_dotted_missing',
      path: 'email',
      target: 'addr.nope',
    });
  });
});

describe('validateTree — cross-schema refs', () => {
  it('flags missing cross-schema target', () => {
    const keys = new Set(['user']);
    const rows = [row({ name: 'x', value: v([{ kind: 'ref', target: 'ghost.field' }]) })];
    expect(validateTree(rows, keys)).toContainEqual({
      kind: 'ref_target_missing',
      path: 'x',
      targetKey: 'ghost',
    });
  });

  it('passes when target schema exists', () => {
    const keys = new Set(['user']);
    const rows = [row({ name: 'x', value: v([{ kind: 'ref', target: 'user.email' }]) })];
    expect(validateTree(rows, keys)).toEqual([]);
  });
});

describe('validateTree — cycle detection', () => {
  const keys = new Set<string>();

  it('flags a 2-cycle', () => {
    const rows = [
      row({ name: 'a', value: v([{ kind: 'field', name: 'b' }]) }),
      row({ name: 'b', value: v([{ kind: 'field', name: 'a' }]) }),
    ];
    const issues = validateTree(rows, keys);
    expect(
      issues.filter((i) => i.kind === 'tpl_cycle').map((i) => i.path).sort(),
    ).toEqual(['a', 'b']);
  });

  it('flags a 3-cycle', () => {
    const rows = [
      row({ name: 'a', value: v([{ kind: 'field', name: 'b' }]) }),
      row({ name: 'b', value: v([{ kind: 'field', name: 'c' }]) }),
      row({ name: 'c', value: v([{ kind: 'field', name: 'a' }]) }),
    ];
    const issues = validateTree(rows, keys);
    expect(
      issues.filter((i) => i.kind === 'tpl_cycle').map((i) => i.path).sort(),
    ).toEqual(['a', 'b', 'c']);
  });

  it('flags a self-cycle', () => {
    const rows = [row({ name: 'a', value: v([{ kind: 'field', name: 'a' }]) })];
    expect(validateTree(rows, keys)).toContainEqual({ kind: 'tpl_cycle', path: 'a' });
  });

  it('does not flag a non-cyclic chain', () => {
    const rows = [
      row({ name: 'a', value: v([{ kind: 'field', name: 'b' }]) }),
      row({ name: 'b' }),
    ];
    expect(validateTree(rows, keys).filter((i) => i.kind === 'tpl_cycle')).toEqual([]);
  });
});

describe('validateTree — name validation (preserved behaviour)', () => {
  it('flags invalid prop names', () => {
    const rows = [row({ name: '1bad' })];
    expect(validateTree(rows, new Set())).toContainEqual({ kind: 'name_invalid', path: '1bad' });
  });

  it('flags duplicate sibling names', () => {
    const rows = [row({ name: 'x' }), row({ name: 'x' })];
    expect(validateTree(rows, new Set())).toContainEqual({
      kind: 'name_duplicate',
      path: 'x',
      sibling: 'x',
    });
  });
});
