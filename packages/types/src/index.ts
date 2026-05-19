/**
 * `@mirage/types` — canonical shared vocabulary.
 *
 * Every service and the SPA consume types from here. Names mirror
 * [CONTEXT.md](../../../CONTEXT.md) exactly. If a name disagrees with that
 * file, this file is wrong, not CONTEXT.md.
 *
 * The OpenAPI-generated types (`paths`, `components`) are also re-exported
 * here under the `Api` namespace — import them as
 * `import type { Api } from '@mirage/types'` and reach for
 * `Api.components['schemas']['Workspace']`. The matching .yaml lives at
 * `packages/types/openapi.yaml`; the generated module at
 * `src/openapi.generated.ts` is rebuilt by `postinstall` (and by
 * `pnpm gen:openapi`).
 */

export * from './branded.js';
export * from './org.js';
export * from './workspace.js';
export * from './custom-function.js';
export * from './schema.js';
export * from './set.js';
export * from './run.js';
export * from './auth.js';

export type * as Api from './openapi.generated.js';
