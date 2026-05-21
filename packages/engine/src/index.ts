/**
 * `@mirage/engine` — pure generation core.
 *
 * No I/O. Same inputs always produce the same outputs (modulo the supplied
 * salt). Consumed by the generation worker, the BFF (for cycle validation),
 * and the SPA (for live relationship-graph highlighting).
 */

export * from './errors.js';
export * from './cycle.js';
export * from './custom-function-registry.js';
export * from './resolve-schema.js';
export * from './apply-strategy.js';
export * from './extract-set-edges.js';
export * from './extract-fn-refs.js';
export * from './rng.js';
export * from './faker-engine.js';
export * from './topology.js';
export * from './plan-run-set.js';
export * from './strategy-resolver.js';
export * from './generate-rows.js';
export * from './run-set-stream.js';
export * from './dry-run.js';
