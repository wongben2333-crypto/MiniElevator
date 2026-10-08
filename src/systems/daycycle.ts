// Day-cycle system: maps ticks to a phase and rolls the day over at the boundary.
// Pure mutation of World in place. No tick increment, no DOM.

import type { Floor, Phase, SimConfig, World } from '../types';
import { UPGRADE_CHOICES, growthFloor } from '../config';

/** Per-day demand growth applied by `demandScale`. */
const DAY_DEMAND_GROWTH = 0.15;

/** Phase for a tick, given the configured day length and cut points. */
export function currentPhase(tick: number, cfg: SimConfig): Phase {
  const frac = (tick % cfg.dayLengthTicks) / cfg.dayLengthTicks;
  if (frac < cfg.phaseCuts[0]) return 'morning';
  if (frac < cfg.phaseCuts[1]) return 'midday';
  if (frac < cfg.phaseCuts[2]) return 'evening';
  return 'night';
}

/** Demand multiplier: 1 on day 1, growing 15% per subsequent day. */
export function demandScale(day: number): number {
  return 1 + (day - 1) * DAY_DEMAND_GROWTH;
}

/** Add one floor above the current top (tenants move in). No-op at the cap. */
function growBuilding(world: World): void {
  const top = world.floors.reduce((max, f) => (f.id > max ? f.id : max), 0);
  const spec = growthFloor(top + 1);
  if (spec === null) return;
  const floor: Floor = {
    id: spec.id,
    name: spec.name,
    zone: spec.zone,
    waiting: [],
    pressure: 0,
    capacity: spec.capacity,
  };
  if (spec.special !== undefined) floor.special = spec.special;
  world.floors.push(floor);
}

/**
 * Writes the current phase, then — on a day boundary — advances the day, grows the
 * building by one floor, and offers the upgrade choice (a fresh copy, so callers may
 * mutate it freely). Non-boundary ticks leave `dayEnded` / `pendingUpgrade` untouched.
 */
export function stepDayCycle(world: World, cfg: SimConfig): void {
  world.phase = currentPhase(world.tick, cfg);

  if (world.tick > 0 && world.tick % cfg.dayLengthTicks === 0) {
    world.day += 1;
    world.dayEnded = true;
    world.pendingUpgrade = UPGRADE_CHOICES.map((offer) => ({ ...offer }));
    growBuilding(world);
  }
}
