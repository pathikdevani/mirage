import { describe, it, expect } from 'vitest';
import {
  buildFakerIndex,
  classifyRefEdge,
  type FakerIndex,
} from '../classify-ref-edges.js';
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

describe('classifyRefEdge', () => {
  it('A: scalar cross-projection to primitive is soft', () => {
    const schemas = [
      schema('phone', [methodProp('id'), refProp('person_id', 'person.id')]),
      schema('person', [methodProp('id'), refProp('phone_id', 'phone.id')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'person_id', targetKey: 'person', targetField: 'id' },
        idx,
      ),
    ).toEqual({ hard: false });
  });

  it('B: ref without field is hard:embedding', () => {
    const schemas = [
      schema('phone', [methodProp('id'), refProp('person_obj', 'person')]),
      schema('person', [methodProp('id')]),
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
    const schemas = [schema('phone', [methodProp('id'), refProp('parent_id', 'phone.id')])];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'parent_id', targetKey: 'phone', targetField: 'id' },
        idx,
      ),
    ).toEqual({ hard: false });
  });

  it('C-hard: self-ref without field is hard:embedding', () => {
    const schemas = [schema('phone', [methodProp('id'), refProp('self', 'phone')])];
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
      schema('phone', [methodProp('id'), refProp('x', 'person.y')]),
      schema('person', [methodProp('id'), refProp('y', 'phone.x')]),
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
    const schemas = [schema('phone', [methodProp('id'), refProp('p', 'person.id')])];
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
      fields: [methodProp('city'), methodProp('zip')],
      required: false,
    } as SchemaProp;
    const schemas = [
      schema('person', [methodProp('id'), addressObj]),
      schema('phone', [methodProp('id'), refProp('city_ref', 'person.address.city')]),
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
      schema('a', [methodProp('id'), refProp('toB', 'b.toC')]),
      schema('b', [methodProp('id'), refProp('toC', 'c.id')]),
      schema('c', [methodProp('id')]),
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
      schema('phone', [methodProp('id', 'string.uuid'), methodProp('name', 'person.firstName')]),
    ]);
    expect(idx.get('phone:id')).toEqual([{ kind: 'method', method: 'string.uuid' }]);
    expect(idx.get('phone:name')).toEqual([{ kind: 'method', method: 'person.firstName' }]);
  });

  it('indexes nested objects with dotted paths', () => {
    const obj: SchemaProp = {
      name: 'address',
      type: 'object',
      fields: [methodProp('city', 'location.city')],
      required: false,
    } as SchemaProp;
    const idx = buildFakerIndex([schema('person', [methodProp('id'), obj])]);
    expect(idx.get('person:address.city')).toEqual([
      { kind: 'method', method: 'location.city' },
    ]);
  });
});
