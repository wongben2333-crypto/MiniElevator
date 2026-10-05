import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { completedDays, scoreWorld, starBar, starsForDays } from '../src/score';
import { stats, world } from './fixtures';

const cfg = DEFAULT_CONFIG;

describe('starsForDays', () => {
  it('awards one star per completed day, capped at three', () => {
    expect(starsForDays(0)).toBe(0);
    expect(starsForDays(1)).toBe(1);
    expect(starsForDays(2)).toBe(2);
    expect(starsForDays(3)).toBe(3);
    expect(starsForDays(9)).toBe(3);
  });
});

describe('completedDays', () => {
  it('counts the in-progress day 1 as zero completed days', () => {
    expect(completedDays(world({ day: 1 }))).toBe(0);
    expect(completedDays(world({ day: 4 }))).toBe(3);
  });
});

describe('starBar', () => {
  it('renders a three-glyph bar and clamps out-of-range input', () => {
    expect(starBar(0)).toBe('☆☆☆');
    expect(starBar(2)).toBe('★★☆');
    expect(starBar(5)).toBe('★★★');
  });
});

describe('scoreWorld', () => {
  it('scores zero when nothing was delivered', () => {
    const b = scoreWorld(world({ day: 2, stats: stats({ delivered: 0, energy: 999 }) }), cfg);
    expect(b.score).toBe(0);
    expect(b.stars).toBe(1);
  });

  it('is bounded to 0..100 for extreme stats', () => {
    const great = scoreWorld(
      world({ day: 5, stats: stats({ delivered: 1000, totalWaitTicks: 0, energy: 0, transfers: 0 }) }),
      cfg,
    );
    expect(great.score).toBe(100);
    const awful = scoreWorld(
      world({
        day: 5,
        stats: stats({ delivered: 5, totalWaitTicks: 60 * 60 * 10_000, energy: 1e9, transfers: 9999 }),
      }),
      cfg,
    );
    expect(awful.score).toBeGreaterThanOrEqual(0);
  });

  it('rewards more deliveries and lower wait, all else equal', () => {
    const base = { delivered: 100, totalWaitTicks: 100 * 60 * 10, energy: 400, transfers: 10 };
    const baseline = scoreWorld(world({ stats: stats(base) }), cfg);
    const moreDelivered = scoreWorld(world({ stats: stats({ ...base, delivered: 200 }) }), cfg);
    const lessWait = scoreWorld(world({ stats: stats({ ...base, totalWaitTicks: 100 * 60 * 2 }) }), cfg);

    expect(moreDelivered.score).toBeGreaterThan(baseline.score);
    expect(lessWait.score).toBeGreaterThan(baseline.score);
  });
});
