/**
 * Ambient .d.ts string registered with Monaco's javascriptDefaults so the
 * editor offers IntelliSense for the implicit `ctx` argument without forcing
 * users to write TypeScript. The saved source is still plain JS.
 */
export const MONACO_AMBIENT_TYPES = `
// Mirage custom-function ambient types.
// These are only seen by the editor — the saved file is JavaScript.
declare const ctx: ValueGeneratorContext;

interface ValueGeneratorContext {
  faker: FakerLike;
  rng: () => number;
  salt: string;
}

interface StrategyContext {
  sourceRows: ReadonlyArray<Record<string, unknown>>;
  targetRows: ReadonlyArray<Record<string, unknown>>;
  cardinality: 'one' | { type: 'many'; min: number; max: number };
  rng: () => number;
  salt: string;
}

/** A tiny subset of faker-js types — enough for IntelliSense. */
interface FakerLike {
  person: {
    firstName(): string;
    lastName(): string;
    fullName(): string;
    jobTitle(): string;
  };
  internet: {
    email(): string;
    url(): string;
    ipv4(): string;
    userName(): string;
  };
  string: {
    uuid(): string;
    nanoid(): string;
    alphanumeric(len?: number): string;
  };
  date: {
    past(): Date;
    future(): Date;
    recent(): Date;
  };
  location: {
    city(): string;
    country(): string;
    streetAddress(): string;
  };
  helpers: {
    arrayElement<T>(items: ReadonlyArray<T>): T;
  };
  number: {
    int(opts?: { min?: number; max?: number }): number;
    float(opts?: { min?: number; max?: number }): number;
  };
}
`;
