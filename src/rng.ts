// Deterministic PRNG (mulberry32). No dependencies.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform element of a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /**
   * Weighted pick. Uses EXACTLY ONE next() call regardless of item count/weights.
   * weight(item) must return a finite number >= 0. If the total weight <= 0 (or
   * the array is empty), fall back to a uniform pick via the same single next().
   * An empty array returns `undefined as T` and consumes no randomness.
   */
  pickWeighted<T>(arr: readonly T[], weight: (item: T) => number): T;
  /** True with probability p. */
  chance(p: number): boolean;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)] as T;
    },
    pickWeighted<T>(arr: readonly T[], weight: (item: T) => number): T {
      if (arr.length === 0) return undefined as T;
      const u = next();
      let total = 0;
      for (const item of arr) total += weight(item);
      if (!(total > 0)) return arr[Math.floor(u * arr.length)] as T;
      const target = u * total;
      let cumulative = 0;
      for (const item of arr) {
        cumulative += weight(item);
        if (target < cumulative) return item;
      }
      return arr[arr.length - 1] as T;
    },
    chance(p: number): boolean {
      return next() < p;
    },
  };
}
