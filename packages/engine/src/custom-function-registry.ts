import type { CustomFunctionId } from '@mirage/types';

/**
 * The engine is pure: it does not load Custom Function source from Mongo
 * itself. Whoever calls into the engine (the generation worker today, the
 * SPA's live-preview path tomorrow) supplies a registry mapping ids to
 * source strings. The engine then hands the source off to `@mirage/sandbox`
 * for execution.
 */
export interface CustomFunctionRegistry {
  get(id: CustomFunctionId): string | undefined;
}

/**
 * Convenience constructor for tests and previews — wraps a plain Map.
 */
export const customFunctionRegistryFromMap = (
  map: ReadonlyMap<CustomFunctionId, string>,
): CustomFunctionRegistry => ({
  get: (id) => map.get(id),
});
