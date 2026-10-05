import { describe, expect, it } from 'vitest';
import type { Passenger, SimConfig, World, Zone } from '../src/types';
import { DEFAULT_CONFIG, UPGRADE_CHOICES } from '../src/config';
import { mulberry32 } from '../src/rng';
import { stepSpawn } from '../src/systems/spawn';
import { elevator, floor, world } from './fixtures';

function cfg(over: Partial<SimConfig> = {}): SimConfig {
  return { ...DEFAULT_CONFIG, ...over };
}

/**
 * One elevator stops at every floor, so every zone pair is reachable and
 * every spawned passenger resolves a non-empty plan.
 */
function connectedWorld(over: Partial<World> = {}): World {
  return world({
    floors: [
      floor(1, 'lobby'),
      floor(2, 'office'),
      floor(3, 'office'),
      floor(4, 'residential'),
      floor(5, 'retail'),
    ],
    elevators: [elevator(1, [1, 2, 3, 4, 5])],
    phase: 'morning',
    ...over,
  });
}

interface Spawn {
  id: number;
  from: number;
  destZone: Zone;
}

/** Drive `ticks` spawn steps and record the passengers that appeared. */
function spawnSequence(seed: number, ticks: number): Spawn[] {
  const w = connectedWorld();
  const rng = mulberry32(seed);
  const out: Spawn[] = [];
  for (let i = 0; i < ticks; i += 1) {
    w.tick += 1;
    const before = w.nextPassengerId;
    stepSpawn(w, cfg(), rng);
    if (w.nextPassengerId !== before) {
      const p = w.passengers.get(before);
      if (p !== undefined) out.push({ id: p.id, from: p.from, destZone: p.destZone });
    }
  }
  return out;
}

describe('stepSpawn', () => {
  it('produces an identical spawn sequence for the same seed', () => {
    const a = spawnSequence(1234, 1500);
    const b = spawnSequence(1234, 1500);

    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('spawns a passenger whose destZone differs from the origin zone, tracked and planned', () => {
    const w = connectedWorld();
    const rng = mulberry32(7);

    let spawned: Passenger | undefined;
    for (let i = 0; i < 2000 && spawned === undefined; i += 1) {
      w.tick += 1;
      const before = w.nextPassengerId;
      stepSpawn(w, cfg(), rng);
      if (w.nextPassengerId !== before) spawned = w.passengers.get(before);
    }

    expect(spawned).toBeDefined();
    if (spawned === undefined) throw new Error('no passenger spawned');

    const origin = w.floors.find((f) => f.id === spawned?.from);
    expect(origin).toBeDefined();
    if (origin === undefined) throw new Error('origin floor missing');

    expect(spawned.destZone).not.toBe(origin.zone);
    expect(w.passengers.get(spawned.id)).toBe(spawned);
    expect(origin.waiting).toContain(spawned.id);
    expect(spawned.plan.length).toBeGreaterThan(0);
  });

  it('never exceeds the passenger cap', () => {
    const cap = 3;
    const w = connectedWorld({ phase: 'evening' });
    const rng = mulberry32(99);

    for (let i = 0; i < 5000; i += 1) {
      w.tick += 1;
      stepSpawn(w, cfg({ passengerCap: cap }), rng);
    }

    expect(w.passengers.size).toBeLessThanOrEqual(cap);
    expect(w.passengers.size).toBe(cap);
  });

  it('does not spawn while a pending upgrade pauses the day', () => {
    const w = connectedWorld({
      pendingUpgrade: UPGRADE_CHOICES.map((o) => ({ ...o })),
    });
    const rng = mulberry32(5);

    for (let i = 0; i < 2000; i += 1) {
      w.tick += 1;
      stepSpawn(w, cfg(), rng);
    }

    expect(w.passengers.size).toBe(0);
  });
});
