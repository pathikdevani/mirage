import { describe, it, expect } from 'vitest';
import { faker } from '@faker-js/faker';
import { FAKER_GROUPS } from '../registry.generated.js';
import { FAKER_CATALOG } from '../catalog.generated.js';
import type { ParamKind } from '../types.js';

const KINDS: readonly ParamKind[] = [
  'integer',
  'number',
  'string',
  'boolean',
  'enum',
  'date',
  'array',
  'regex',
];

function fakerHasParams(ns: string, method: string): boolean {
  const mod = (faker as unknown as Record<string, Record<string, unknown>>)[ns];
  const fn = mod?.[method];
  return typeof fn === 'function' && (fn as { length: number }).length > 0;
}

describe('FAKER_CATALOG audit', () => {
  it('every method with parameters has a catalog entry', () => {
    const missing: string[] = [];
    for (const g of FAKER_GROUPS) {
      for (const m of g.methods) {
        if (fakerHasParams(g.ns, m) && !FAKER_CATALOG[`${g.ns}.${m}`]) {
          missing.push(`${g.ns}.${m}`);
        }
      }
    }
    expect(missing, `Missing from catalog overrides:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every catalog entry references an existing faker method', () => {
    const stale: string[] = [];
    for (const key of Object.keys(FAKER_CATALOG)) {
      const dot = key.indexOf('.');
      const ns = key.slice(0, dot);
      const method = key.slice(dot + 1);
      const mod = (faker as unknown as Record<string, Record<string, unknown>>)[ns];
      if (typeof mod?.[method] !== 'function') stale.push(key);
    }
    expect(stale, `Stale catalog entries:\n${stale.join('\n')}`).toEqual([]);
  });

  it('every param kind is one of the allowed kinds', () => {
    const bad: string[] = [];
    for (const [key, entry] of Object.entries(FAKER_CATALOG)) {
      for (const p of entry.params) {
        if (!KINDS.includes(p.kind)) bad.push(`${key} :: ${p.name} → ${p.kind}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('enum params have non-empty options', () => {
    const bad: string[] = [];
    for (const [key, entry] of Object.entries(FAKER_CATALOG)) {
      for (const p of entry.params) {
        if (p.kind === 'enum' && (!p.options || p.options.length === 0)) {
          bad.push(`${key} :: ${p.name}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
