import type { BrandColor } from './types.js';

/** Tailwind background classes for each brand colour. Matches schemas/lib/colors.ts. */
export const BRAND_COLOR_BG: Record<BrandColor, string> = {
  violet: 'bg-brand-violet',
  cyan: 'bg-brand-cyan',
  emerald: 'bg-brand-emerald',
  amber: 'bg-brand-amber',
  rose: 'bg-brand-rose',
  slate: 'bg-brand-slate',
};

export const BRAND_COLORS: BrandColor[] = ['violet', 'cyan', 'emerald', 'amber', 'rose', 'slate'];
