/**
 * Sandbox worker entry — runs inside a `worker_threads` Worker.
 *
 * Security model (TECH_ARCHITECHRE.md §3.4):
 * - User source is compiled with `vm.compileFunction` inside a fresh
 *   `vm.Context` per call (or per pool slot, recycled).
 * - The context is built with `vm.createContext({})` so it has *no* Node
 *   globals — `require`, `process`, `Buffer`, `fs`, `module`, `__dirname` are
 *   absent. We deliberately expose only the function arguments.
 * - `vm`'s `timeout` option enforces the per-call wall-clock limit. Worker
 *   `resourceLimits.maxOldGenerationSizeMb` caps memory.
 * - The worker terminates itself if a single call OOMs; the pool spins a
 *   replacement.
 *
 * This file is a skeleton — the message loop is unwired until the engine is
 * ready to invoke Custom Functions in earnest. See pool.ts for the matching
 * stub on the main-thread side.
 */

// Importing types only — no runtime worker_threads usage yet.
import type { SandboxMessageFromWorker, SandboxMessageToWorker } from './protocol.js';

/**
 * Placeholder signature for the message handler the worker will eventually
 * register on `parentPort.on('message', handle)`. Kept exported so tests
 * and future implementations can target the same shape.
 */
export type WorkerHandler = (msg: SandboxMessageToWorker) => SandboxMessageFromWorker;
