import { describe, it, expect } from 'vitest';
import type { MethodEntry } from '@mirage/fakerjs';
import { toInternal, toStored } from '../serialize.js';

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

describe('toInternal/toStored', () => {
  it('round-trips options shape', () => {
    expect(toStored(optionsEntry, toInternal(optionsEntry, { min: 10, max: 20 }))).toEqual({
      min: 10,
      max: 20,
    });
  });

  it('round-trips positional shape', () => {
    expect(toStored(positionalEntry, toInternal(positionalEntry, ['female']))).toEqual(['female']);
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
    expect(toStored(entry, { a: 'x' })).toEqual(['x']);
  });

  it('returns undefined for shape "none"', () => {
    const none: MethodEntry = { shape: 'none', params: [] };
    expect(toStored(none, { foo: 'bar' })).toBeUndefined();
  });
});
