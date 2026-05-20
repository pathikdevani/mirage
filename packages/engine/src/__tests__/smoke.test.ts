import { describe, it, expect } from 'vitest';
import { hashSeed } from '../rng.js';

describe('engine smoke', () => {
  it('hashSeed is deterministic', () => {
    expect(hashSeed('a', 'b')).toBe(hashSeed('a', 'b'));
    expect(hashSeed('a', 'b')).not.toBe(hashSeed('a', 'c'));
  });
});
