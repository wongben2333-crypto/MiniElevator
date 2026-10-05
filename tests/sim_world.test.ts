import { describe, expect, it } from 'vitest';
import { BUILDING, DEFAULT_CONFIG } from '../src/config';
import { mulberry32 } from '../src/rng';
import { applyCommand, createWorld, step } from '../src/sim';
import type { Passenger, World } from '../src/types';

const cfg = DEFAULT_CONFIG;

function hash(w: World): string {
  return JSON.stringify({
    tick: w.tick,
    day: w.day,
    phase: w.phase,
    delivered: w.stats.delivered,
    transfers: w.stats.transfers,
    energy: Math.round(w.stats.energy),
    pax: [...w.passengers.keys()].sort((a, b) => a - b),
    load: w.elevators.map((e) => e.load.length),
    pos: w.elevators.map((e) => Math.round(e.pos * 1000)),
  });
}

function waitingPassenger(id: number, from: number, destZone: Passenger['destZone']): Passenger {
  return {
    id,
    from,
    destZone,
    dir: -1,
    group: 1,
    patience: 100,
    state: 'WAIT',
    atFloor: from,
    plan: [],
    legIndex: 0,
  };
}

describe('createWorld', () => {
  it('builds every configured floor and the default elevators', () => {
    const w = createWorld(1, cfg);
    expect(w.floors.map((f) => f.id)).toEqual(BUILDING.map((b) => b.id));
    expect(w.elevators.length).toBeGreaterThanOrEqual(2);
    expect(w.tick).toBe(0);
    expect(w.day).toBe(1);
    expect(w.phase).toBe('morning');
    expect(w.gameOver).toBeNull();
    expect(w.passengers.size).toBe(0);
  });
});

describe('applyCommand', () => {
  it('setStops replaces the stop list and re-plans waiting passengers', () => {
    const w = createWorld(1, cfg);
    const p = waitingPassenger(99, 2, 'lobby');
    w.passengers.set(99, p);
    const f2 = w.floors.find((f) => f.id === 2);
    if (!f2) throw new Error('missing floor 2');
    f2.waiting.push(99);

    applyCommand(w, { t: 'setStops', tick: 0, elev: 0, stops: [1, 2, 3] }, cfg);

    expect(w.elevators[0].stops).toEqual([1, 2, 3]);
    expect(p.plan.length).toBeGreaterThan(0);
  });

  it('delivers a rider parked on a destination-zone floor instead of stranding it', () => {
    const w = createWorld(1, cfg);
    const e0 = w.elevators[0];
    e0.pos = 5;
    const p: Passenger = {
      id: 999,
      from: 1,
      destZone: 'office',
      dir: 1,
      group: 1,
      patience: 100_000,
      state: 'RIDE',
      atFloor: 1,
      onElev: 0,
      plan: [{ elevator: 0, boardFloor: 1, alightFloor: 5, rideDir: 1 }],
      legIndex: 0,
    };
    w.passengers.set(999, p);
    e0.load.push(999);

    // Floor 5 leaves elevator 0; the nearest surviving stop (floor 4) is in the
    // rider's destination zone, so the rider has effectively arrived.
    applyCommand(w, { t: 'setStops', tick: 0, elev: 0, stops: [1, 2, 3, 4] }, cfg);

    expect(w.passengers.has(999)).toBe(false);
    expect(w.stats.delivered).toBe(1);
  });

  it('setPolicy updates the elevator policy', () => {
    const w = createWorld(1, cfg);
    applyCommand(w, { t: 'setPolicy', tick: 0, elev: 0, policy: 'ALL_CALL' }, cfg);
    expect(w.elevators[0].policy).toBe('ALL_CALL');
  });

  it('addElevator appends an elevator with a valid stop list', () => {
    const w = createWorld(1, cfg);
    const before = w.elevators.length;
    applyCommand(
      w,
      {
        t: 'addElevator',
        tick: 0,
        spec: { color: '#fff', stops: [1, 2, 3], capacity: 6, speed: 1, policy: 'SCAN', idleFloor: 1 },
      },
      cfg,
    );
    expect(w.elevators.length).toBe(before + 1);
    const last = w.elevators[w.elevators.length - 1];
    expect(last.stops.length).toBeGreaterThanOrEqual(2);
  });

  it('chooseUpgrade clears the pending upgrade', () => {
    const w = createWorld(1, cfg);
    w.pendingUpgrade = [{ kind: 'addCapacity', label: 'x' }];
    applyCommand(w, { t: 'chooseUpgrade', tick: 0, kind: 'addCapacity' }, cfg);
    expect(w.pendingUpgrade).toBeNull();
  });
});

describe('step', () => {
  it('is deterministic: same seed produces identical worlds after many ticks', () => {
    const a = createWorld(7, cfg);
    const b = createWorld(7, cfg);
    const ra = mulberry32(a.seed);
    const rb = mulberry32(b.seed);
    for (let i = 0; i < 600; i += 1) {
      step(a, cfg, ra);
      step(b, cfg, rb);
    }
    expect(hash(a)).toEqual(hash(b));
  });
});
