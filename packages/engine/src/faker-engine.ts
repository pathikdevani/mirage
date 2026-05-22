import { Faker, allLocales, type LocaleDefinition } from '@mirage/fakerjs';
import { EngineError } from './errors.js';

/**
 * A small wrapper around a `@faker-js/faker` instance with the seeding and
 * dispatching helpers the row resolver needs.
 *
 * `localeHonored` is `false` when `locale` was not in faker's catalog and we
 * fell back to `en`. Callers may surface this as a warning.
 */
export interface FakerEngine {
  /** Reseed faker before generating rows for a Schema. */
  seed(n: number): void;
  /** Invoke `faker.<ns>.<method>(...args)` by dotted-path. */
  call(method: string, args?: unknown): unknown;
  /** Exposed for Custom Functions' `ctx.faker`. */
  faker: Faker;
  /** Whether the requested locale was honored (vs. fallback to en). */
  localeHonored: boolean;
}

const LOCALES: Record<string, LocaleDefinition> = allLocales as Record<string, LocaleDefinition>;

export function createFakerEngine(locale: string): FakerEngine {
  const requested = LOCALES[locale];
  const fallback = LOCALES['en']!;
  const localeStack = requested ? [requested, fallback] : [fallback];
  const faker = new Faker({ locale: localeStack });

  return {
    seed(n: number): void {
      faker.seed(n);
    },
    call(method: string, args?: unknown): unknown {
      const segments = method.split('.');
      if (segments.length < 2) {
        throw new EngineError('unknown_faker_method', { method });
      }
      let cursor: unknown = faker;
      for (let i = 0; i < segments.length - 1; i++) {
        const next = (cursor as Record<string, unknown>)[segments[i]!];
        if (next === undefined || next === null) {
          throw new EngineError('unknown_faker_method', { method });
        }
        cursor = next;
      }
      const tail = segments[segments.length - 1]!;
      const fn = (cursor as Record<string, unknown>)[tail];
      if (typeof fn !== 'function') {
        throw new EngineError('unknown_faker_method', { method });
      }
      const callArgs = Array.isArray(args)
        ? args
        : args !== undefined && args !== null
          ? [args]
          : [];
      try {
        return (fn as (...a: unknown[]) => unknown).call(cursor, ...callArgs);
      } catch (e) {
        throw new EngineError('faker_call_failed', {
          method,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
    faker,
    localeHonored: Boolean(requested),
  };
}
