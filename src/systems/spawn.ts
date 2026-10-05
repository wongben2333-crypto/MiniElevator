// Passenger spawn system: injects new waiting passengers by phase-driven rate.
// Mutates World in place. No tick increment, no DOM.

import type { Passenger, SimConfig, World, Zone } from '../types';
import { SPAWN_PER_SECOND, secToTicks } from '../config';
import { floorsMatching } from '../queries';
import { findPlan } from '../route';
import type { Rng } from '../rng';
import { demandScale } from './daycycle';

/** Distinct destination zones reachable from `from`, excluding its own zone. */
function destinationZones(world: World, originZone: Zone): Zone[] {
  const zones: Zone[] = [];
  for (const f of world.floors) {
    if (f.zone !== originZone && !zones.includes(f.zone)) zones.push(f.zone);
  }
  return zones;
}

export function stepSpawn(world: World, cfg: SimConfig, rng: Rng): void {
  if (world.pendingUpgrade !== null) return;
  if (world.passengers.size >= cfg.passengerCap) return;

  const ratePerTick = (SPAWN_PER_SECOND[world.phase] * demandScale(world.day)) / cfg.simHz;
  if (!rng.chance(Math.min(1, ratePerTick))) return;

  const from = rng.pick(world.floors);
  const zones = destinationZones(world, from.zone);
  if (zones.length === 0) return;
  const destZone = rng.pick(zones);

  // Nearest floor in the destination zone (by id distance from the origin).
  const destFloors = floorsMatching(world, destZone);
  let destFloorId = destFloors[0].id;
  for (const f of destFloors) {
    if (Math.abs(f.id - from.id) < Math.abs(destFloorId - from.id)) destFloorId = f.id;
  }

  const id = world.nextPassengerId;
  world.nextPassengerId += 1;

  const passenger: Passenger = {
    id,
    from: from.id,
    destZone,
    dir: destFloorId > from.id ? 1 : -1,
    group: rng.int(1, 2),
    patience: secToTicks(cfg.patience, cfg.simHz),
    state: 'WAIT',
    atFloor: from.id,
    plan: [],
    legIndex: 0,
  };
  passenger.plan = findPlan(world, passenger, cfg) ?? [];

  world.passengers.set(id, passenger);
  from.waiting.push(id);
}
