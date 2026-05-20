/**
 * Deterministic PRNG + seed-derivation helpers. Used by the engine for all
 * random choices so identical `Set + salt` produces identical rows.
 */

/** mulberry32 — 32-bit state, returns [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a 32-bit hash of an arbitrary list of strings, separated by the unit
 * separator character so distinct part lists never collide trivially.
 */
export function hashSeed(...parts: string[]): number {
  let h = 0x811c9dc5;
  const SEP = 0x1f;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (i > 0) h = Math.imul(h ^ SEP, 16777619);
    for (let j = 0; j < p.length; j++) {
      h = Math.imul(h ^ p.charCodeAt(j), 16777619);
    }
  }
  return h >>> 0;
}
