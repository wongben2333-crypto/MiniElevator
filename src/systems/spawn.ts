// Passenger spawn system: injects new waiting passengers by phase-driven rate.
// Mutates World in place. No tick increment, no DOM.

import type { Passenger, SimConfig, World } from '../types';
import { SPAWN_PER_SECOND, secToTicks, spawnDestWeight, spawnOriginWeight } from '../config';
import { planPassenger } from '../route';
import type { Rng } from '../rng';
import { demandScale } from './daycycle';

export function stepSpawn(world: World, cfg: SimConfig, rng: Rng): void {
  if (world.pendingUpgrade !== null) return;
  if (world.passengers.size >= cfg.passengerCap) return;

  const ratePerTick = (SPAWN_PER_SECOND[world.phase] * demandScale(world.day)) / cfg.simHz;
  if (!rng.chance(Math.min(1, ratePerTick))) return;

  // Departures skew toward functional floors (lobby, skyLobby, restaurant, skybar,
  // parking) rather than being uniform. One weighted pick = exactly one next().
  const from = rng.pickWeighted(world.floors, spawnOriginWeight);

  // Arrivals: a weighted pick over every floor in a *different* zone. The exact
  // floor (not just its zone) becomes the passenger's target, so destinations
  // spread across all floors instead of collapsing to one floor per zone.
  const candidates = world.floors.filter((f) => f.zone !== from.zone);
  // A single-zone world has no valid destination; skipping the dest pick only affects
  // that pathological case, which the shipped 11-floor building never hits.
  if (candidates.length === 0) return;
  const destFloor = rng.pickWeighted(candidates, spawnDestWeight);

  const id = world.nextPassengerId;

  const passenger: Passenger = {
    id,
    from: from.id,
    destZone: destFloor.zone,
    destFloor: destFloor.id,
    dir: destFloor.id > from.id ? 1 : -1,
    group: rng.int(1, 2),
    patience: secToTicks(cfg.patience, cfg.simHz),
    state: 'WAIT',
    atFloor: from.id,
    plan: [],
    legIndex: 0,
  };
  const plan = planPassenger(world, passenger, cfg);
  // No route to the exact floor nor to any floor in its zone (e.g. an
  // unconnected growth floor): skip this spawn rather than add a stranded waiter.
  if (plan.length === 0) return;
  passenger.plan = plan;

  world.nextPassengerId += 1;
  world.passengers.set(id, passenger);
  from.waiting.push(id);
}
