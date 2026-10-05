// TDD for src/systems/pressure.ts: congestion pressure, game over, patience decay.

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { stepPressure } from '../src/systems/pressure';
import { floor, passenger, stats, world } from './fixtures';

describe('stepPressure', () => {
  it('sets pressure to clamped people/capacity, counting group sizes', () => {
    const half = floor(1, 'lobby', { waiting: [1, 2], capacity: 10 });
    const full = floor(2, 'office', { waiting: [3, 4], capacity: 3 });
    const empty = floor(3, 'office', { waiting: [], capacity: 0 });
    const ghost = floor(4, 'office', { waiting: [404], capacity: 1 });
    const w = world({
      floors: [half, full, empty, ghost],
      passengers: new Map([
        [1, passenger(1, 1, 'office', { group: 3 })],
        [2, passenger(2, 1, 'office', { group: 2 })],
        [3, passenger(3, 2, 'office', { group: 2 })],
        [4, passenger(4, 2, 'office', { group: 2 })],
      ]),
    });

    stepPressure(w, DEFAULT_CONFIG);

    expect(half.pressure).toBe(0.5); // (3 + 2) / 10
    expect(full.pressure).toBe(1); // clamped 4 / 3
    expect(empty.pressure).toBe(0); // no waiting, capacity 0 guarded
    expect(ghost.pressure).toBe(1); // missing passenger counts as group 1
  });

  it('never advances world.tick', () => {
    const w = world({ tick: 7 });
    stepPressure(w, DEFAULT_CONFIG);
    expect(w.tick).toBe(7);
  });

  it('sets gameOver after pressure stays full for pressureThresholdTicks consecutive ticks', () => {
    const cfg = { ...DEFAULT_CONFIG, pressureThresholdTicks: 3 };
    const hot = floor(1, 'lobby', { waiting: [1], capacity: 1 });
    const w = world({
      floors: [hot],
      passengers: new Map([[1, passenger(1, 1, 'office', { patience: 100 })]]),
    });

    for (let i = 0; i < 2; i++) {
      w.tick += 1;
      stepPressure(w, cfg);
    }
    expect(hot.pressure).toBe(1);
    expect(w.overPressureTicks.get(1)).toBe(2);
    expect(w.gameOver).toBeNull();

    w.tick += 1;
    stepPressure(w, cfg);
    expect(w.overPressureTicks.get(1)).toBe(3);
    expect(w.gameOver).toEqual({ floor: 1 });
  });

  it('resets the streak when pressure drops below full, delaying game over', () => {
    const cfg = { ...DEFAULT_CONFIG, pressureThresholdTicks: 3 };
    const hot = floor(1, 'lobby', { waiting: [1], capacity: 1 });
    const w = world({
      floors: [hot],
      passengers: new Map([[1, passenger(1, 1, 'office', { patience: 100 })]]),
    });

    w.tick += 1;
    stepPressure(w, cfg);
    w.tick += 1;
    stepPressure(w, cfg);
    expect(w.overPressureTicks.get(1)).toBe(2);

    hot.waiting = [];
    w.tick += 1;
    stepPressure(w, cfg);
    expect(hot.pressure).toBe(0);
    expect(w.overPressureTicks.get(1)).toBe(0);
    expect(w.gameOver).toBeNull();

    hot.waiting = [1];
    w.tick += 1;
    stepPressure(w, cfg);
    w.tick += 1;
    stepPressure(w, cfg);
    expect(w.gameOver).toBeNull();

    w.tick += 1;
    stepPressure(w, cfg);
    expect(w.gameOver).toEqual({ floor: 1 });
  });

  it('keeps the first gameOver and never overwrites it', () => {
    const cfg = { ...DEFAULT_CONFIG, pressureThresholdTicks: 2 };
    const first = floor(1, 'lobby', { waiting: [1], capacity: 1 });
    const second = floor(2, 'office', { waiting: [2], capacity: 1 });
    const w = world({
      floors: [first, second],
      passengers: new Map([
        [1, passenger(1, 1, 'office', { patience: 100 })],
        [2, passenger(2, 2, 'office', { patience: 100 })],
      ]),
    });

    w.tick += 1;
    stepPressure(w, cfg);
    w.tick += 1;
    stepPressure(w, cfg);
    expect(w.gameOver).toEqual({ floor: 1 });

    w.tick += 1;
    stepPressure(w, cfg);
    expect(w.overPressureTicks.get(2)).toBe(3); // second floor keeps its own streak
    expect(w.gameOver).toEqual({ floor: 1 });
  });

  it('does not overwrite or re-trigger a pre-existing gameOver', () => {
    const cfg = { ...DEFAULT_CONFIG, pressureThresholdTicks: 1 };
    const hot = floor(1, 'lobby', { waiting: [1], capacity: 1 });
    const w = world({
      floors: [hot],
      gameOver: { floor: 9 },
      passengers: new Map([[1, passenger(1, 1, 'office', { patience: 100 })]]),
    });

    stepPressure(w, cfg);

    expect(w.overPressureTicks.get(1)).toBe(1);
    expect(w.gameOver).toEqual({ floor: 9 });
  });

  it('decays patience only for WAIT/TRANSFER passengers and updates wait stats', () => {
    const cfg = { ...DEFAULT_CONFIG, patience: 1, simHz: 10 }; // secToTicks = 10
    const waiting = passenger(1, 1, 'office', { state: 'WAIT', patience: 10 });
    const transfer = passenger(2, 1, 'office', { state: 'TRANSFER', patience: 10 });
    const riding = passenger(3, 1, 'office', { state: 'RIDE', patience: 10 });
    const done = passenger(4, 1, 'office', { state: 'DONE', patience: 10 });
    const w = world({
      stats: stats({ maxWaitTicks: 3 }),
      passengers: new Map([
        [1, waiting],
        [2, transfer],
        [3, riding],
        [4, done],
      ]),
    });

    stepPressure(w, cfg);

    expect(waiting.patience).toBe(9);
    expect(transfer.patience).toBe(9);
    expect(riding.patience).toBe(10);
    expect(done.patience).toBe(10);
    expect(w.stats.totalWaitTicks).toBe(2);
    expect(w.stats.maxWaitTicks).toBe(3); // waited 1 < existing 3

    w.tick += 1;
    stepPressure(w, cfg);
    expect(waiting.patience).toBe(8);
    expect(transfer.patience).toBe(8);
    expect(w.stats.totalWaitTicks).toBe(4);

    for (let i = 0; i < 5; i++) {
      w.tick += 1;
      stepPressure(w, cfg);
    }
    expect(waiting.patience).toBe(3);
    expect(w.stats.totalWaitTicks).toBe(14);
    expect(w.stats.maxWaitTicks).toBe(7); // waited = 10 - 3 > 3
  });

  it('floors patience at 0 and keeps accumulating wait ticks', () => {
    const cfg = { ...DEFAULT_CONFIG, patience: 1, simHz: 10 };
    const p = passenger(1, 1, 'office', { state: 'WAIT', patience: 1 });
    const w = world({ passengers: new Map([[1, p]]) });

    stepPressure(w, cfg);
    expect(p.patience).toBe(0);
    expect(w.stats.maxWaitTicks).toBe(10); // waited = 10 - 0

    w.tick += 1;
    stepPressure(w, cfg);
    expect(p.patience).toBe(0);
    expect(w.stats.totalWaitTicks).toBe(2);
    expect(w.stats.maxWaitTicks).toBe(10);
  });
});
