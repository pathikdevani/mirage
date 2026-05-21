import { describe, it, expect } from 'vitest';
import {
  buildFakerIndex,
  classifyRefEdge,
  type FakerIndex,
} from '../classify-ref-edges.js';
import type { Api } from '@mirage/types';

type SchemaProp = Api.components['schemas']['SchemaProp'];

function primitive(name: string, faker = 'string.uuid'): SchemaProp {
  return { name, type: 'string', faker, required: false } as SchemaProp;
}

function schema(key: string, props: SchemaProp[]) {
  return { key, properties: props } as Api.components['schemas']['Schema'];
}

describe('classifyRefEdge', () => {
  it('A: scalar cross-projection to primitive is soft', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person_id', '$ref:person.id')]),
      schema('person', [primitive('id'), primitive('phone_id', '$ref:phone.id')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'person_id', targetKey: 'person', targetField: 'id' },
        idx,
      ),
    ).toEqual({ hard: false });
  });

  it('B: $ref without field is hard:embedding', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person_obj', '$ref:person')]),
      schema('person', [primitive('id')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'person_obj', targetKey: 'person', targetField: undefined },
        idx,
      ),
    ).toEqual({ hard: true, kind: 'embedding' });
  });

  it('C-soft: self-ref to primitive id is soft', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('parent_id', '$ref:phone.id')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'parent_id', targetKey: 'phone', targetField: 'id' },
        idx,
      ),
    ).toEqual({ hard: false });
  });

  it('C-hard: self-ref without field is hard:embedding', () => {
    const schemas = [schema('phone', [primitive('id'), primitive('self', '$ref:phone')])];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'self', targetKey: 'phone', targetField: undefined },
        idx,
      ),
    ).toEqual({ hard: true, kind: 'embedding' });
  });

  it('D: field-projection chain closing on itself is hard:field_deadlock', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('x', '$ref:person.y')]),
      schema('person', [primitive('id'), primitive('y', '$ref:phone.x')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'x', targetKey: 'person', targetField: 'y' },
        idx,
      ),
    ).toEqual({ hard: true, kind: 'field_deadlock' });
  });

  it('orphan target field is treated as soft (no transitive dep)', () => {
    const schemas = [schema('phone', [primitive('id'), primitive('p', '$ref:person.id')])];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'p', targetKey: 'person', targetField: 'id' },
        idx,
      ),
    ).toEqual({ hard: false });
  });

  it('nested object field path resolves correctly', () => {
    const addressObj: SchemaProp = {
      name: 'address',
      type: 'object',
      fields: [primitive('city'), primitive('zip')],
      required: false,
    } as SchemaProp;
    const schemas = [
      schema('person', [primitive('id'), addressObj]),
      schema('phone', [primitive('id'), primitive('city_ref', '$ref:person.address.city')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        {
          fromSchemaKey: 'phone',
          fromFieldPath: 'city_ref',
          targetKey: 'person',
          targetField: 'address.city',
        },
        idx,
      ),
    ).toEqual({ hard: false });
  });

  it('three-hop chain that terminates at a primitive is soft', () => {
    const schemas = [
      schema('a', [primitive('id'), primitive('toB', '$ref:b.toC')]),
      schema('b', [primitive('id'), primitive('toC', '$ref:c.id')]),
      schema('c', [primitive('id')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'a', fromFieldPath: 'toB', targetKey: 'b', targetField: 'toC' },
        idx,
      ),
    ).toEqual({ hard: false });
  });
});

describe('buildFakerIndex', () => {
  it('indexes flat properties', () => {
    const idx: FakerIndex = buildFakerIndex([
      schema('phone', [primitive('id', 'string.uuid'), primitive('name', 'person.firstName')]),
    ]);
    expect(idx.get('phone:id')).toBe('string.uuid');
    expect(idx.get('phone:name')).toBe('person.firstName');
  });

  it('indexes nested objects with dotted paths', () => {
    const obj: SchemaProp = {
      name: 'address',
      type: 'object',
      fields: [primitive('city', 'location.city')],
      required: false,
    } as SchemaProp;
    const idx = buildFakerIndex([schema('person', [primitive('id'), obj])]);
    expect(idx.get('person:address.city')).toBe('location.city');
  });
});
