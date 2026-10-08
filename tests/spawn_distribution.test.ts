import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { mulberry32 } from '../src/rng';
import { createWorld } from '../src/sim';
import { stepSpawn } from '../src/systems/spawn';

// Functional floors (parking, lobby, skyLobby, restaurant, skybar): these should
// generate more departures than ordinary office floors so the building "behaves
// like a real tower" instead of spawning uniformly.
const FUNCTIONAL_ORIGINS = new Set([-1, 1, 5, 9, 10]);
const OFFICE_ORIGINS = new Set([2, 3, 4, 6, 7, 8]);

const TICKS = 100_000;

interface Tally {
  origins: Map<number, number>;
  destinations: Map<number, number>;
  destZoneViolations: number;
  emptyPlans: number;
  total: number;
}

function emptyTally(): Tally {
  return {
    origins: new Map(),
    destinations: new Map(),
    destZoneViolations: 0,
    emptyPlans: 0,
    total: 0,
  };
}

/**
 * Drive `stepSpawn` on the real shipped world. Spawned passengers would pile up
 * against the cap, so each tick we clear `passengers` and every floor's `waiting`
 * to keep the sampling stream flowing.
 *
 * Because the world never advances (no movement/boarding), a passenger's plan is
 * its destination route; the last leg's `alightFloor` is the arrival floor.
 */
function sample(seed: number, ticks: number): Tally {
  const world = createWorld(seed, DEFAULT_CONFIG);
  const rng = mulberry32(seed);
  const tally = emptyTally();

  for (let i = 0; i < ticks; i += 1) {
    world.tick += 1;
    const before = world.nextPassengerId;
    stepSpawn(world, DEFAULT_CONFIG, rng);
    if (world.nextPassengerId === before) continue;

    const p = world.passengers.get(before);
    if (p !== undefined) {
      const origin = world.floors.find((f) => f.id === p.from);
      if (origin !== undefined) {
        tally.origins.set(p.from, (tally.origins.get(p.from) ?? 0) + 1);
        tally.total += 1;

        const lastLeg = p.plan[p.plan.length - 1];
        if (lastLeg === undefined) {
          tally.emptyPlans += 1;
        } else {
          tally.destinations.set(
            lastLeg.alightFloor,
            (tally.destinations.get(lastLeg.alightFloor) ?? 0) + 1,
          );
          const dest = world.floors.find((f) => f.id === lastLeg.alightFloor);
          if (dest === undefined || dest.zone === origin.zone || p.destZone !== dest.zone) {
            tally.destZoneViolations += 1;
          }
        }
      }
    }

    world.passengers.clear();
    for (const f of world.floors) f.waiting.length = 0;
  }
  return tally;
}

function sum(counts: Map<number, number>, ids: Set<number>): number {
  let total = 0;
  for (const id of ids) total += counts.get(id) ?? 0;
  return total;
}

const tally = sample(4242, TICKS);

describe('stepSpawn distribution (shipped 11-floor building)', () => {
  it('spawns a meaningful sample during the morning phase', () => {
    expect(tally.total).toBeGreaterThan(300);
  });

  it('gives every configured floor at least one departure (no starved origin)', () => {
    const world = createWorld(4242, DEFAULT_CONFIG);
    for (const floor of world.floors) {
      expect(
        tally.origins.get(floor.id) ?? 0,
        `floor ${floor.id} never spawned an origin`,
      ).toBeGreaterThan(0);
    }
  });

  it('departs functional floors more often than ordinary office floors', () => {
    const functional = sum(tally.origins, FUNCTIONAL_ORIGINS);
    const office = sum(tally.origins, OFFICE_ORIGINS);
    expect(functional).toBeGreaterThan(office);
  });

  it('gives every configured floor at least one arrival (no starved destination)', () => {
    const world = createWorld(4242, DEFAULT_CONFIG);
    for (const floor of world.floors) {
      expect(
        tally.destinations.get(floor.id) ?? 0,
        `floor ${floor.id} never received a passenger`,
      ).toBeGreaterThan(0);
    }
  });

  it('sends more arrivals to functional floors than to ordinary offices', () => {
    const functional = sum(tally.destinations, FUNCTIONAL_ORIGINS);
    const office = sum(tally.destinations, OFFICE_ORIGINS);
    expect(functional).toBeGreaterThan(office);
  });

  it('keeps any single floor below 30% of all departures', () => {
    for (const [id, count] of tally.origins) {
      expect(count / tally.total, `floor ${id} share`).toBeLessThan(0.3);
    }
  });

  it('sends every passenger to another zone with a non-empty plan', () => {
    expect(tally.emptyPlans).toBe(0);
    expect(tally.destZoneViolations).toBe(0);
  });

  it('produces an identical tally for the same seed (determinism)', () => {
    const a = sample(4242, TICKS);
    const b = sample(4242, TICKS);
    expect([...a.origins.entries()].sort((x, y) => x[0] - y[0])).toEqual(
      [...b.origins.entries()].sort((x, y) => x[0] - y[0]),
    );
    expect([...a.destinations.entries()].sort((x, y) => x[0] - y[0])).toEqual(
      [...b.destinations.entries()].sort((x, y) => x[0] - y[0]),
    );
    expect(a.total).toBe(b.total);
    expect(a.destZoneViolations).toBe(b.destZoneViolations);
    expect(a.emptyPlans).toBe(b.emptyPlans);
  });
});
