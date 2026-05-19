import type { BrandColor } from './types.js';

/**
 * Tailwind v4 surfaces every `--color-*` token as a utility. For brand colors
 * declared in `packages/ui-kit/src/globals.css` we get `bg-brand-violet`,
 * `text-brand-violet`, etc. We hard-code the lookups so Tailwind's purge can
 * still see the literal class names.
 */
export const COLOR_BG: Record<BrandColor, string> = {
  violet: 'bg-brand-violet',
  cyan: 'bg-brand-cyan',
  emerald: 'bg-brand-emerald',
  amber: 'bg-brand-amber',
  rose: 'bg-brand-rose',
  slate: 'bg-brand-slate',
};

export const COLOR_TEXT: Record<BrandColor, string> = {
  violet: 'text-brand-violet',
  cyan: 'text-brand-cyan',
  emerald: 'text-brand-emerald',
  amber: 'text-brand-amber',
  rose: 'text-brand-rose',
  slate: 'text-brand-slate',
};

export function colorTile(color: BrandColor): string {
  return `${COLOR_BG[color]} text-white`;
}
