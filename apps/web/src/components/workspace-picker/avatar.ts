/**
 * Picks a deterministic brand color for a workspace based on its id.
 * The design has 6 swatches (violet/cyan/emerald/amber/rose/slate) but the
 * theme only exposes 5 brand tokens — we omit `slate` and reuse 5.
 */
const COLORS = [
  { bg: 'bg-brand-violet/15', fg: 'text-brand-violet' },
  { bg: 'bg-brand-cyan/15', fg: 'text-brand-cyan' },
  { bg: 'bg-brand-emerald/15', fg: 'text-brand-emerald' },
  { bg: 'bg-brand-amber/15', fg: 'text-brand-amber' },
  { bg: 'bg-brand-rose/15', fg: 'text-brand-rose' },
] as const;

export type AvatarColor = (typeof COLORS)[number];

export function colorForId(id: string): AvatarColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

export function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  const second = parts[1];
  if (!first) return '?';
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}
