import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { mulberry32, type Rng } from '../src/rng';
import { applyCommand, createWorld, step } from '../src/sim';
import type { Passenger, SimConfig, World } from '../src/types';

// Fast day (600 ticks = 10s) so a 3-day run stays cheap.
const fast: SimConfig = { ...DEFAULT_CONFIG, dayLengthTicks: 600 };

function advance(w: World, cfg: SimConfig, rng: Rng, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) {
    if (w.gameOver) return;
    if (w.pendingUpgrade) {
      applyCommand(w, { t: 'chooseUpgrade', tick: w.tick, kind: 'addCapacity' }, cfg);
      continue;
    }
    step(w, cfg, rng);
  }
}

function assertFinite(w: World): void {
  for (const e of w.elevators) {
    expect(Number.isFinite(e.pos)).toBe(true);
  }
}

describe('3-day headless integration', () => {
  it('survives three days without throwing or producing NaN', () => {
    const w = createWorld(3, fast);
    const rng = mulberry32(w.seed);
    advance(w, fast, rng, fast.dayLengthTicks * 3 + 5);
    assertFinite(w);
    expect(w.tick).toBeGreaterThan(0);
    expect(w.day).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic across independent runs', () => {
    const run = (): string => {
      const w = createWorld(11, fast);
      const rng = mulberry32(w.seed);
      advance(w, fast, rng, fast.dayLengthTicks * 2);
      return JSON.stringify({
        day: w.day,
        delivered: w.stats.delivered,
        pax: w.passengers.size,
        pos: w.elevators.map((e) => Math.round(e.pos * 100)),
      });
    };
    expect(run()).toEqual(run());
  });

  it('names the bottleneck floor when a floor stays over capacity', () => {
    const w = createWorld(5, fast);
    const rng = mulberry32(w.seed);
    const lobby = w.floors.find((f) => f.id === 1);
    if (!lobby) throw new Error('no lobby floor');
    for (let i = 0; i < lobby.capacity + 5; i += 1) {
      const id = w.nextPassengerId;
      w.nextPassengerId += 1;
      const p: Passenger = {
        id,
        from: 1,
        destZone: 'office',
        dir: 1,
        group: 1,
        patience: 100_000,
        state: 'WAIT',
        atFloor: 1,
        plan: [],
        legIndex: 0,
      };
      w.passengers.set(id, p);
      lobby.waiting.push(id);
    }

    for (let i = 0; i < fast.pressureThresholdTicks + 2 && !w.gameOver; i += 1) {
      step(w, fast, rng);
    }

    expect(w.gameOver).toEqual({ floor: 1 });
  });
});
