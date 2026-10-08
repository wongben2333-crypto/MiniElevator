import { describe, expect, it } from 'vitest';
import { mulberry32, type Rng } from '../src/rng';

/** Number of stream values an operation consumes, probed from the deterministic stream. */
function consumed(seed: number, op: (r: Rng) => void, cap = 64): number {
  const r = mulberry32(seed);
  op(r);
  const after = r.next();
  for (let k = 0; k < cap; k++) {
    const probe = mulberry32(seed);
    for (let i = 0; i < k; i++) probe.next();
    if (probe.next() === after) return k;
  }
  return -1;
}

/** Proxy whose next() is counted, so "no extra randomness" is observable by the caller. */
function countingProxy(seed: number): { rng: Rng; calls: () => number } {
  const inner = mulberry32(seed);
  let calls = 0;
  const rng: Rng = {
    next: () => {
      calls++;
      return inner.next();
    },
    int: (min, max) => inner.int(min, max),
    pick: <T>(arr: readonly T[]): T => inner.pick(arr),
    pickWeighted: <T>(arr: readonly T[], weight: (item: T) => number): T =>
      inner.pickWeighted(arr, weight),
    chance: (p) => inner.chance(p),
  };
  return { rng, calls: () => calls };
}

describe('pickWeighted', () => {
  it('is deterministic: same seed yields the same picks', () => {
    // Given: two generators seeded identically
    const a = mulberry32(2024);
    const b = mulberry32(2024);
    const w = (x: number): number => 1 + x;

    // When: both draw weighted picks from the same array
    const seqA = Array.from({ length: 24 }, () => a.pickWeighted([1, 2, 3, 4], w));
    const seqB = Array.from({ length: 24 }, () => b.pickWeighted([1, 2, 3, 4], w));

    // Then: the sequences are identical
    expect(seqA).toEqual(seqB);
    expect(seqA).toHaveLength(24);
  });

  it('is proportional to weights [1,3] within tolerance', () => {
    // Given: weights 1 and 3
    const r = mulberry32(7);
    const items = ['rare', 'common'] as const;
    const weight = (x: (typeof items)[number]): number => (x === 'rare' ? 1 : 3);

    // When: 20000 weighted picks
    let rare = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (r.pickWeighted(items, weight) === 'rare') rare++;

    // Then: share matches 1/4 within 5 percentage points
    expect(rare / N).toBeGreaterThan(0.2);
    expect(rare / N).toBeLessThan(0.3);
  });

  it('never returns an item with zero weight', () => {
    // Given: weights where only the middle item is pickable
    const r = mulberry32(31);
    const items = ['a', 'b', 'c'] as const;

    // When: 5000 weighted picks
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      seen.add(r.pickWeighted(items, (x) => (x === 'b' ? 1 : 0)));
    }

    // Then: only 'b' was ever returned
    expect([...seen]).toEqual(['b']);
  });

  it('falls back to an even-ish distribution when every weight is zero', () => {
    // Given: all weights zero (total <= 0)
    const r = mulberry32(11);
    const items = ['a', 'b', 'c'] as const;
    const zero = (): number => 0;

    // When: 3000 weighted picks
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 3000; i++) counts[r.pickWeighted(items, zero)]++;

    // Then: no crash, every item reachable, all near 1/3
    for (const key of ['a', 'b', 'c'] as const) {
      expect(counts[key]).toBeGreaterThan(850);
      expect(counts[key]).toBeLessThan(1150);
    }
  });

  it('returns the only element of a single-element array', () => {
    // Given: a one-element array with any weight
    const r = mulberry32(5);

    // When: picking it 50 times
    for (let i = 0; i < 50; i++) expect(r.pickWeighted(['solo'], () => 42)).toBe('solo');
  });

  it('treats all-equal weights as uniform', () => {
    // Given: equal weights on four items
    const r = mulberry32(99);
    const items = [0, 1, 2, 3] as const;

    // When: 4000 weighted picks
    const counts = [0, 0, 0, 0];
    const N = 4000;
    for (let i = 0; i < N; i++) counts[r.pickWeighted(items, () => 1)]++;

    // Then: each item near 25%
    for (const c of counts) {
      expect(c / N).toBeGreaterThan(0.2);
      expect(c / N).toBeLessThan(0.3);
    }
  });

  it('consumes exactly one stream value regardless of array size', () => {
    // Given: arrays of 2, 3 and 1000 items
    const two = [1, 2];
    const three = [1, 2, 3];
    const thousand = Array.from({ length: 1000 }, (_, i) => i);

    // When/Then: each pick advances the stream by exactly one
    expect(consumed(1234, (r) => void r.pickWeighted(two, () => 1))).toBe(1);
    expect(consumed(1234, (r) => void r.pickWeighted(three, (x) => x))).toBe(1);
    expect(consumed(1234, (r) => void r.pickWeighted(thousand, (x) => (x % 7) + 1))).toBe(1);
  });

  it('returns undefined for an empty array without consuming randomness', () => {
    // Given: an empty array behind a counting proxy
    const { rng, calls } = countingProxy(64);

    // When: picking from it
    const picked = rng.pickWeighted<string[]>([], () => 1);

    // Then: undefined, and the proxy observed zero next() calls
    expect(picked).toBeUndefined();
    expect(calls()).toBe(0);
  });

  it('holds the stream position: picks interleave with raw next() draws', () => {
    // Given: one generator used for a pick and a raw draw
    const r = mulberry32(4242);
    const before = r.next();

    // When: a weighted pick happens
    r.pickWeighted([1, 2], () => 1);
    const after = r.next();

    // Then: it is the value two steps into the fresh stream, not later
    const probe = mulberry32(4242);
    probe.next();
    probe.next();
    expect(before).not.toBe(after);
    expect(after).toBe(probe.next());
  });
});