/**
 * The engine is pure: it does not load Custom Function source from Mongo
 * itself. Whoever calls into the engine (the generation worker today, the
 * SPA's live-preview path tomorrow) supplies a registry mapping ids to source +
 * usage metadata. The engine then hands the source off to `@mirage/sandbox`
 * for execution and asserts the call site's required usage.
 */
export interface CustomFunctionEntry {
  source: string;
  usage: 'valueGenerator' | 'strategy' | 'both';
}

export interface CustomFunctionRegistry {
  get(id: string): CustomFunctionEntry | undefined;
}

/** Convenience constructor for tests and previews — wraps a plain Map. */
export const customFunctionRegistryFromMap = (
  map: ReadonlyMap<string, CustomFunctionEntry>,
): CustomFunctionRegistry => ({
  get: (id) => map.get(id),
});
