import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, growthFloor, MAX_FLOOR_ID } from '../src/config';
import { findPlan } from '../src/route';
import { applyCommand, createWorld } from '../src/sim';
import { stepDayCycle } from '../src/systems/daycycle';
import type { SimConfig } from '../src/types';
import { passenger } from './fixtures';

// A 10-tick day keeps boundary crossings cheap.
const cfg: SimConfig = { ...DEFAULT_CONFIG, dayLengthTicks: 10 };

function crossOneDay(world: ReturnType<typeof createWorld>): void {
  world.tick += cfg.dayLengthTicks;
  stepDayCycle(world, cfg);
}

describe('building growth (tenants move in)', () => {
  it('adds exactly one floor at each day boundary', () => {
    const w = createWorld(1, cfg);
    const before = w.floors.length;
    const topBefore = Math.max(...w.floors.map((f) => f.id));

    crossOneDay(w);

    expect(w.day).toBe(2);
    expect(w.floors.length).toBe(before + 1);
    const added = w.floors[w.floors.length - 1];
    expect(added.id).toBe(topBefore + 1);
    expect(added.name).toBe(`${topBefore + 1}F`);
    expect(added.waiting).toEqual([]);
    expect(added.pressure).toBe(0);
    expect(added.capacity).toBeGreaterThan(0);
  });

  it('does NOT auto-extend any elevator stop list (the player connects it)', () => {
    const w = createWorld(1, cfg);
    const stopsBefore = w.elevators.map((e) => [...e.stops]);

    crossOneDay(w);

    expect(w.elevators.map((e) => [...e.stops])).toEqual(stopsBefore);
  });

  it('stops growing at MAX_FLOOR_ID', () => {
    const w = createWorld(1, cfg);
    for (let i = 0; i < 40; i += 1) crossOneDay(w);

    const top = Math.max(...w.floors.map((f) => f.id));
    expect(top).toBe(MAX_FLOOR_ID);
    expect(growthFloor(MAX_FLOOR_ID + 1)).toBeNull();
  });

  it('assigns a deterministic zone per floor id', () => {
    expect(growthFloor(11)).toEqual(growthFloor(11));
    expect(growthFloor(11)?.zone).toBeDefined();
  });

  it('keeps a new floor unreachable until the player connects it', () => {
    const w = createWorld(3, cfg);
    crossOneDay(w);
    const newId = Math.max(...w.floors.map((f) => f.id));

    const p = passenger(999, newId, 'lobby', { atFloor: newId });
    expect(findPlan(w, p, cfg)).toBeNull();

    const high = w.elevators[1];
    applyCommand(w, { t: 'setStops', tick: w.tick, elev: high.id, stops: [...high.stops, newId] }, cfg);

    expect(findPlan(w, p, cfg)?.length ?? 0).toBeGreaterThan(0);
  });
});
