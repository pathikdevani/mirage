import { describe, it, expect } from 'vitest';
import { extractSetEdges } from '../extract-set-edges.js';
import type { Api, ValueExpr } from '@mirage/types';

type SchemaProp = Api.components['schemas']['SchemaProp'];

function methodProp(name: string, method = 'string.uuid'): SchemaProp {
  return {
    name,
    type: 'string',
    required: false,
    value: [{ kind: 'method', method }],
  } as SchemaProp;
}

function refProp(name: string, target: string): SchemaProp {
  return {
    name,
    type: 'string',
    required: false,
    value: [{ kind: 'ref', target }] as ValueExpr,
  } as SchemaProp;
}

function schema(key: string, props: SchemaProp[]) {
  return { key, properties: props } as Api.components['schemas']['Schema'];
}

describe('extractSetEdges hard/soft classification', () => {
  it('marks scalar id cross-references as soft', () => {
    const schemas = [
      schema('phone', [methodProp('id'), refProp('person_id', 'person.id')]),
      schema('person', [methodProp('id'), refProp('phone_id', 'phone.id')]),
    ];
    const edges = extractSetEdges(schemas, new Set(['phone', 'person']));
    expect(edges).toHaveLength(2);
    for (const e of edges) {
      expect(e.hard).toBe(false);
      expect(e.cycleKind).toBeUndefined();
    }
  });

  it('marks ref without field as hard:embedding', () => {
    const schemas = [
      schema('phone', [methodProp('id'), refProp('person_obj', 'person')]),
      schema('person', [methodProp('id')]),
    ];
    const edges = extractSetEdges(schemas, new Set(['phone', 'person']));
    expect(edges).toHaveLength(1);
    expect(edges[0]!.hard).toBe(true);
    expect(edges[0]!.cycleKind).toBe('embedding');
  });

  it('marks field-level deadlock as hard:field_deadlock', () => {
    const schemas = [
      schema('phone', [methodProp('id'), refProp('x', 'person.y')]),
      schema('person', [methodProp('id'), refProp('y', 'phone.x')]),
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
      schema('phone', [methodProp('id'), refProp('person_id', 'person.id')]),
      schema('person', [methodProp('id')]),
    ];
    const edges = extractSetEdges(schemas, new Set(['phone']));
    expect(edges).toEqual([]);
  });
});
