import type { MethodEntry } from '@mirage/fakerjs';

export type ArgsInternal = Record<string, unknown>;
export type ArgsStored = Record<string, unknown> | unknown[];

/** Stored shape → editor-internal `{name: value}` regardless of options/positional. */
export function toInternal(
  entry: MethodEntry | undefined,
  stored: ArgsStored | undefined,
): ArgsInternal {
  if (!stored) return {};
  if (Array.isArray(stored)) {
    if (!entry) return {};
    const out: ArgsInternal = {};
    entry.params.forEach((p, i) => {
      if (i < stored.length && stored[i] !== undefined) out[p.name] = stored[i];
    });
    return out;
  }
  return { ...stored };
}

/** Editor-internal → stored shape (object for options, array for positional). */
export function toStored(
  entry: MethodEntry | undefined,
  internal: ArgsInternal,
): ArgsStored | undefined {
  if (!entry || entry.shape === 'none') return undefined;
  const cleaned: ArgsInternal = {};
  for (const [k, v] of Object.entries(internal)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'string' && v === '') continue;
    cleaned[k] = v;
  }
  if (Object.keys(cleaned).length === 0) return undefined;

  if (entry.shape === 'options') return cleaned;

  // positional: order by catalog params, trim trailing undefined.
  const arr: unknown[] = [];
  let lastDefinedIdx = -1;
  entry.params.forEach((p, i) => {
    arr[i] = cleaned[p.name];
    if (cleaned[p.name] !== undefined) lastDefinedIdx = i;
  });
  if (lastDefinedIdx < 0) return undefined;
  return arr.slice(0, lastDefinedIdx + 1);
}
