import { describe, expect, it } from 'vitest';
import {
  BUILDING,
  DEFAULT_CONFIG,
  MAX_ELEVATORS,
  growthFloor,
  spawnDestWeight,
  spawnOriginWeight,
  type BuildingFloorSpec,
} from '../src/config';
import type { Floor } from '../src/types';

// BUILDING holds specs; the weight accessors take a full simulation Floor.
function asFloor(spec: BuildingFloorSpec): Floor {
  const f: Floor = {
    id: spec.id,
    name: spec.name,
    zone: spec.zone,
    waiting: [],
    pressure: 0,
    capacity: spec.capacity,
  };
  if (spec.special !== undefined) f.special = spec.special;
  return f;
}

function spec(id: number): BuildingFloorSpec {
  const found = BUILDING.find((f) => f.id === id);
  if (!found) throw new Error(`BUILDING is missing floor ${id}`);
  return found;
}

const FUNCTIONAL_IDS = [-1, 1, 5, 9, 10];
const OFFICE_IDS = [2, 3, 4, 6, 7, 8];

describe('DEFAULT_CONFIG day length', () => {
  it('is a 120-second day at 60Hz', () => {
    expect(DEFAULT_CONFIG.simHz).toBe(60);
    expect(DEFAULT_CONFIG.dayLengthTicks).toBe(7200);
  });

  it('caps the elevator network at five cars', () => {
    expect(MAX_ELEVATORS).toBe(5);
  });
});

describe('BUILDING floor names', () => {
  it('gives functional floors a descriptive, non-`NF` name', () => {
    for (const id of FUNCTIONAL_IDS) {
      expect(spec(id).name).not.toBe(`${id}F`);
    }
  });

  it('keeps ordinary office floors named exactly `<id>F`', () => {
    for (const id of OFFICE_IDS) {
      expect(spec(id).zone).toBe('office');
      expect(spec(id).special).toBeUndefined();
      expect(spec(id).name).toBe(`${id}F`);
    }
  });

  it('names the first growth floor 11F', () => {
    expect(growthFloor(11)?.name).toBe('11F');
  });
});

describe('spawn weights', () => {
  const officeOrigin = spawnOriginWeight(asFloor(spec(2)));
  const officeDest = spawnDestWeight(asFloor(spec(2)));

  it('returns finite, positive weights for every BUILDING floor', () => {
    for (const s of BUILDING) {
      const f = asFloor(s);
      expect(Number.isFinite(spawnOriginWeight(f)), `${f.name} origin`).toBe(true);
      expect(spawnOriginWeight(f), `${f.name} origin`).toBeGreaterThan(0);
      expect(Number.isFinite(spawnDestWeight(f)), `${f.name} dest`).toBe(true);
      expect(spawnDestWeight(f), `${f.name} dest`).toBeGreaterThan(0);
    }
  });

  it('makes functional floors stronger origins than ordinary offices', () => {
    for (const id of FUNCTIONAL_IDS) {
      expect(spawnOriginWeight(asFloor(spec(id))), `floor ${id} origin`).toBeGreaterThan(officeOrigin);
    }
  });

  it('gives every functional floor a stronger destination pull than offices', () => {
    for (const id of FUNCTIONAL_IDS) {
      expect(spawnDestWeight(asFloor(spec(id))), `floor ${id} dest`).toBeGreaterThan(officeDest);
    }
  });

  it('applies the special override instead of the zone base', () => {
    // 5F is zone 'office' but special 'skyLobby': override 2.2 beats zone base 1.0.
    expect(spawnOriginWeight(asFloor(spec(5)))).toBe(2.2);
    // B1 is zone 'special' but special 'parking': override 1.3 beats zone base 1.5.
    expect(spawnOriginWeight(asFloor(spec(-1)))).toBe(1.3);
    // 9F is zone 'retail' but special 'restaurant': dest 2.2 beats zone base 1.4.
    expect(spawnDestWeight(asFloor(spec(9)))).toBe(2.2);
  });
});
