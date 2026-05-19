/**
 * `@mirage/sandbox` — worker-thread + `node:vm` execution boundary for
 * user-written JavaScript (Custom Functions, custom Strategies).
 *
 * The generation worker is the only consumer today. The SPA is *never*
 * permitted to evaluate Custom Functions — all execution is server-side.
 * See TECH_ARCHITECHRE.md §3.4.
 */

export * from './types.js';
export * from './protocol.js';
export * from './pool.js';
