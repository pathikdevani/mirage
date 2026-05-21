import { describe, it, expect } from 'vitest';
import { extractSetEdges } from '../extract-set-edges.js';
import type { Api } from '@mirage/types';

type SchemaProp = Api.components['schemas']['SchemaProp'];

function primitive(name: string, faker = 'string.uuid'): SchemaProp {
  return { name, type: 'string', faker, required: false } as SchemaProp;
}

function schema(key: string, props: SchemaProp[]) {
  return { key, properties: props } as Api.components['schemas']['Schema'];
}

describe('extractSetEdges hard/soft classification', () => {
  it('marks scalar id cross-references as soft', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person_id', '$ref:person.id')]),
      schema('person', [primitive('id'), primitive('phone_id', '$ref:phone.id')]),
    ];
    const edges = extractSetEdges(schemas, new Set(['phone', 'person']));
    expect(edges).toHaveLength(2);
    for (const e of edges) {
      expect(e.hard).toBe(false);
      expect(e.cycleKind).toBeUndefined();
    }
  });

  it('marks $ref without field as hard:embedding', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person_obj', '$ref:person')]),
      schema('person', [primitive('id')]),
    ];
    const edges = extractSetEdges(schemas, new Set(['phone', 'person']));
    expect(edges).toHaveLength(1);
    expect(edges[0]!.hard).toBe(true);
    expect(edges[0]!.cycleKind).toBe('embedding');
  });

  it('marks field-level deadlock as hard:field_deadlock', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('x', '$ref:person.y')]),
      schema('person', [primitive('id'), primitive('y', '$ref:phone.x')]),
    ];
    const edges = extractSetEdges(schemas, new Set(['phone', 'person']));
    expect(edges).toHaveLength(2);
    for (const e of edges) {
      expect(e.hard).toBe(true);
      expect(e.cycleKind).toBe('field_deadlock');
    }
  });

  it('skips refs whose target is outside the inclusion set', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person_id', '$ref:person.id')]),
      schema('person', [primitive('id')]),
    ];
    const edges = extractSetEdges(schemas, new Set(['phone']));
    expect(edges).toEqual([]);
  });
});
