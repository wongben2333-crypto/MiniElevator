import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { mulberry32, type Rng } from '../src/rng';
import { applyCommand, createWorld, step } from '../src/sim';
import type { SimConfig, World } from '../src/types';

// The SHIPPED configuration: 180-second days (not the accelerated test day).
const cfg = DEFAULT_CONFIG;

function advance(w: World, c: SimConfig, rng: Rng, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) {
    if (w.gameOver) return;
    if (w.pendingUpgrade) {
      applyCommand(w, { t: 'chooseUpgrade', tick: w.tick, kind: 'addElevator' }, c);
      continue;
    }
    step(w, c, rng);
  }
}

describe('shipped-configuration survival', () => {
  it('survives three full-length days on the default network across seeds', () => {
    for (const seed of [1, 2, 3, 5, 7, 11, 42]) {
      const w = createWorld(seed, cfg);
      const rng = mulberry32(w.seed);
      advance(w, cfg, rng, cfg.dayLengthTicks * 3 + 5);
      expect(w.gameOver, `seed ${seed} game-over at floor ${w.gameOver?.floor}`).toBeNull();
      expect(w.day, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves no structurally-stranded waiter (empty plan) across seeds', () => {
    for (const seed of [1, 2, 3, 5, 7, 11, 42]) {
      const w = createWorld(seed, cfg);
      const rng = mulberry32(w.seed);
      advance(w, cfg, rng, cfg.dayLengthTicks * 3 + 5);
      const stranded = [...w.passengers.values()].filter(
        (p) => (p.state === 'WAIT' || p.state === 'TRANSFER') && p.plan.length === 0,
      );
      expect(stranded.map((p) => p.id), `seed ${seed}`).toEqual([]);
    }
  });
});
