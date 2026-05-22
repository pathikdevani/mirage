import { describe, it, expect } from 'vitest';
import { createFakerEngine } from '../faker-engine.js';
import { EngineError } from '../errors.js';

describe('createFakerEngine.call', () => {
  it('passes a single options object as the first arg', () => {
    const eng = createFakerEngine('en');
    eng.seed(1);
    const v = eng.call('commerce.price', { min: 10, max: 20 });
    expect(typeof v).toBe('string');
    const n = parseFloat(v as string);
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(20);
  });

  it('spreads positional args from an array', () => {
    const eng = createFakerEngine('en');
    eng.seed(1);
    const v = eng.call('person.firstName', ['female']);
    expect(typeof v).toBe('string');
    expect((v as string).length).toBeGreaterThan(0);
  });

  it('works without args (backwards-compatible)', () => {
    const eng = createFakerEngine('en');
    eng.seed(1);
    const v = eng.call('string.uuid');
    expect(v).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('wraps faker runtime errors in EngineError', () => {
    const eng = createFakerEngine('en');
    eng.seed(1);
    expect(() => eng.call('commerce.price', { min: 100, max: 10 })).toThrow(EngineError);
  });
});
