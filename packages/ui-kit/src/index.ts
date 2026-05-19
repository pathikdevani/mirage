/**
 * `@mirage/ui-kit` — shared design tokens + utilities for Mirage React apps.
 *
 * **No components ship from here.** Per the shadcn convention, components
 * are scaffolded into each consuming app via `pnpm dlx shadcn add <name>`,
 * landing under `apps/<app>/src/components/ui/`. This package only ships:
 *
 * - `globals.css` — Tailwind v4 import + the shared `@theme` block (shadcn
 *   neutral palette). Import it once at the app entry.
 * - `cn()` — the `clsx` + `tailwind-merge` helper every shadcn component
 *   needs. Import via `import { cn } from '@mirage/ui-kit'`.
 *
 * apps/web (T13) consumes both.
 */

export { cn } from './cn.js';
