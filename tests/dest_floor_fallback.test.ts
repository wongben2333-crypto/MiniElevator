import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { mulberry32 } from '../src/rng';
import { planPassenger } from '../src/route';
import { applyCommand, createWorld } from '../src/sim';
import { stepSpawn } from '../src/systems/spawn';
import type { Floor, Passenger } from '../src/types';

function pinnedPassenger(over: Partial<Passenger> = {}): Passenger {
  return {
    id: 999,
    from: 1,
    destZone: 'special',
    destFloor: 10,
    dir: 1,
    group: 1,
    patience: 100_000,
    state: 'WAIT',
    atFloor: 1,
    plan: [],
    legIndex: 0,
    ...over,
  };
}

describe('destFloor routing', () => {
  it('routes to the exact destination floor when it is reachable', () => {
    const w = createWorld(1, DEFAULT_CONFIG);
    const p = pinnedPassenger();
    const plan = planPassenger(w, p, DEFAULT_CONFIG);
    expect(plan.length).toBeGreaterThan(0);
    expect(p.destFloor).toBe(10);
    expect(plan[plan.length - 1].alightFloor).toBe(10);
  });

  it('falls back to the destination zone (clearing destFloor) when the exact floor is gone', () => {
    const w = createWorld(1, DEFAULT_CONFIG);
    const p = pinnedPassenger();
    p.plan = planPassenger(w, p, DEFAULT_CONFIG);
    w.passengers.set(p.id, p);
    const lobby = w.floors.find((f) => f.id === 1);
    if (lobby === undefined) throw new Error('missing lobby');
    lobby.waiting.push(p.id);

    // Remove floor 10 from the only elevator that serves it (high car).
    const high = w.elevators[1];
    applyCommand(w, { t: 'setStops', tick: 0, elev: high.id, stops: [1, 5, 6, 7, 8, 9] }, DEFAULT_CONFIG);

    const after = w.passengers.get(p.id);
    expect(after).toBeDefined();
    expect(after?.plan.length).toBeGreaterThan(0); // re-routed, not stranded
    expect(after?.destFloor).toBeUndefined();
  });

  it('returns no plan for an origin with no elevator service (unconnected growth floor)', () => {
    const w = createWorld(1, DEFAULT_CONFIG);
    const ghost: Floor = {
      id: 99,
      name: '99F',
      zone: 'office',
      waiting: [],
      pressure: 0,
      capacity: 10,
    };
    w.floors.push(ghost);
    const p = pinnedPassenger({ from: 99, atFloor: 99, destZone: 'lobby', destFloor: 1 });
    expect(planPassenger(w, p, DEFAULT_CONFIG)).toEqual([]);
  });

  it('never adds a stranded waiter, even when an unconnected floor exists', () => {
    const w = createWorld(1, DEFAULT_CONFIG);
    w.floors.push({ id: 99, name: '99F', zone: 'office', waiting: [], pressure: 0, capacity: 10 });
    const rng = mulberry32(1);
    for (let i = 0; i < 20_000; i += 1) {
      w.tick += 1;
      stepSpawn(w, DEFAULT_CONFIG, rng);
    }
    expect(w.passengers.size).toBeGreaterThan(0);
    for (const p of w.passengers.values()) {
      expect(p.plan.length, `passenger ${p.id} stranded`).toBeGreaterThan(0);
    }
  });
});
