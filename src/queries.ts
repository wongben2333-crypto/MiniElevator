// Pure, read-only accessors over World. No mutation, no DOM.

import type {
  Elevator,
  ElevatorId,
  Floor,
  FloorId,
  Leg,
  Passenger,
  World,
  Zone,
} from './types';

export function getFloor(world: World, id: FloorId): Floor | undefined {
  return world.floors.find((f) => f.id === id);
}

export function getElevator(world: World, id: ElevatorId): Elevator | undefined {
  return world.elevators.find((e) => e.id === id);
}

export function floorsMatching(world: World, zone: Zone): Floor[] {
  return world.floors.filter((f) => f.zone === zone);
}

export function nextLeg(p: Passenger): Leg | undefined {
  return p.plan[p.legIndex];
}

/** Waiting passengers on `floor` whose next leg boards `elev` going `dir`. */
export function pendingBoard(
  world: World,
  elev: ElevatorId,
  floor: FloorId,
  dir: 1 | -1,
): Passenger[] {
  const f = getFloor(world, floor);
  if (!f) return [];
  const out: Passenger[] = [];
  for (const pid of f.waiting) {
    const p = world.passengers.get(pid);
    if (!p) continue;
    const leg = p.plan[p.legIndex];
    if (leg && leg.elevator === elev && leg.boardFloor === floor && leg.rideDir === dir) {
      out.push(p);
    }
  }
  return out;
}

/** Riders aboard `elev` whose current leg alights on `floor`. */
export function pendingAlight(world: World, elev: ElevatorId, floor: FloorId): Passenger[] {
  const e = getElevator(world, elev);
  if (!e) return [];
  const out: Passenger[] = [];
  for (const pid of e.load) {
    const p = world.passengers.get(pid);
    if (!p) continue;
    const leg = p.plan[p.legIndex];
    if (leg && leg.alightFloor === floor) out.push(p);
  }
  return out;
}

export function pressureOf(floor: Floor): number {
  return floor.pressure;
}
