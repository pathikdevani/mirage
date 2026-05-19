import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * shadcn's canonical `cn` helper — `clsx` for conditional class composition,
 * `tailwind-merge` to resolve conflicting Tailwind utilities (e.g. last
 * `text-*` wins). Every shadcn-generated component imports this.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
