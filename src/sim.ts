// Simulation orchestrator: world construction, the fixed-step pipeline, and
// command application. Owns the tick clock. Pure logic — no DOM, no randomness
// of its own (the deterministic RNG is supplied by the caller).

import { BUILDING, DEFAULT_CONFIG, ELEVATOR_PALETTE, ELEVATOR_SPECS, LOBBY_FLOOR } from './config';
import { getFloor } from './queries';
import { findPlan } from './route';
import { mulberry32, type Rng } from './rng';
import { stepBoarding } from './systems/boarding';
import { stepDayCycle } from './systems/daycycle';
import { stepMovement } from './systems/movement';
import { stepPressure } from './systems/pressure';
import { stepSpawn } from './systems/spawn';
import type { Command, Elevator, ElevatorSpec, Floor, Passenger, SimConfig, World } from './types';

function buildFloors(): Floor[] {
  return BUILDING.map((b) => {
    const f: Floor = {
      id: b.id,
      name: b.name,
      zone: b.zone,
      waiting: [],
      pressure: 0,
      capacity: b.capacity,
    };
    if (b.special !== undefined) f.special = b.special;
    return f;
  });
}

function elevatorFromSpec(id: number, spec: ElevatorSpec): Elevator {
  const start = spec.stops[0] ?? spec.idleFloor ?? LOBBY_FLOOR;
  return {
    id,
    color: spec.color,
    stops: [...spec.stops],
    capacity: spec.capacity,
    speed: spec.speed,
    load: [],
    policy: spec.policy,
    pos: start,
    posPrev: start,
    dir: 1,
    state: 'IDLE',
    targetStopIndex: 0,
    dwellUntilTick: 0,
    idleFloor: spec.idleFloor,
  };
}

export function createWorld(seed = 1, _cfg: SimConfig = DEFAULT_CONFIG): World {
  return {
    tick: 0,
    seed,
    day: 1,
    phase: 'morning',
    dayEnded: false,
    floors: buildFloors(),
    elevators: ELEVATOR_SPECS.map((spec, index) => elevatorFromSpec(index, spec)),
    passengers: new Map(),
    nextPassengerId: 1,
    stats: { delivered: 0, totalWaitTicks: 0, maxWaitTicks: 0, transfers: 0, energy: 0 },
    overPressureTicks: new Map(),
    gameOver: null,
    pendingUpgrade: null,
  };
}

/** Fresh deterministic RNG for a world (call once per run). */
export function makeRng(world: World): Rng {
  return mulberry32(world.seed);
}

/**
 * Advance exactly one fixed tick. Paused while a day-end upgrade is pending or
 * after a game over, so callers may keep calling safely.
 */
export function step(world: World, cfg: SimConfig, rng: Rng): void {
  if (world.gameOver !== null || world.pendingUpgrade !== null) return;
  world.tick += 1;
  stepDayCycle(world, cfg);
  stepSpawn(world, cfg, rng);
  stepMovement(world, cfg);
  stepBoarding(world, cfg);
  stepPressure(world, cfg);
}

function isAtDestination(world: World, p: Passenger): boolean {
  const f = getFloor(world, p.atFloor);
  return f !== undefined && f.zone === p.destZone;
}

/** Mark an already-arrived passenger DONE and remove it from the world. */
function deliverArrived(world: World, p: Passenger): void {
  p.state = 'DONE';
  const f = getFloor(world, p.atFloor);
  if (f !== undefined) f.waiting = f.waiting.filter((id) => id !== p.id);
  world.passengers.delete(p.id);
  world.stats.delivered += p.group;
}

function replanWaiting(world: World, cfg: SimConfig): void {
  for (const p of [...world.passengers.values()]) {
    if (p.state !== 'WAIT' && p.state !== 'TRANSFER') continue;
    // A waiting/transfer passenger already standing on a destination-zone floor has
    // effectively arrived (can happen when a line edit drops them at a goal floor).
    // Otherwise `findPlan` would return an empty plan and strand them un-boardable.
    if (isAtDestination(world, p)) {
      deliverArrived(world, p);
      continue;
    }
    p.plan = findPlan(world, p, cfg) ?? [];
    p.legIndex = 0;
  }
}

/** Force-alight riders whose alight floor was just removed from an elevator. */
function dropOrphanedRiders(world: World, e: Elevator): void {
  const survivors: number[] = [];
  for (const pid of e.load) {
    const p = world.passengers.get(pid);
    if (p === undefined) continue; // dangling id: drop it rather than leak capacity
    const leg = p.plan[p.legIndex];
    if (leg === undefined || e.stops.includes(leg.alightFloor)) {
      survivors.push(pid);
      continue;
    }
    let nearest = e.stops[0];
    let bestD = Infinity;
    for (const s of e.stops) {
      const d = Math.abs(s - e.pos);
      if (d < bestD) {
        bestD = d;
        nearest = s;
      }
    }
    const f = getFloor(world, nearest);
    if (f !== undefined) {
      p.state = 'TRANSFER';
      p.atFloor = nearest;
      p.onElev = undefined;
      f.waiting.push(pid);
    }
  }
  e.load = survivors;
}

function addElevator(world: World, spec: ElevatorSpec): Elevator {
  const id = world.elevators.reduce((max, e) => Math.max(max, e.id), -1) + 1;
  const e = elevatorFromSpec(id, spec);
  world.elevators.push(e);
  return e;
}

/** A relief car that serves every floor — the day-end "add elevator" upgrade. */
function reliefSpec(world: World): ElevatorSpec {
  return {
    color: ELEVATOR_PALETTE[world.elevators.length % ELEVATOR_PALETTE.length],
    stops: world.floors.map((f) => f.id).sort((a, b) => a - b),
    capacity: 8,
    speed: 1.5,
    policy: 'SCAN',
    idleFloor: LOBBY_FLOOR,
  };
}

/** Apply a player command. Topology changes re-plan affected waiting passengers. */
export function applyCommand(world: World, cmd: Command, cfg: SimConfig = DEFAULT_CONFIG): void {
  switch (cmd.t) {
    case 'setStops': {
      const e = world.elevators.find((x) => x.id === cmd.elev);
      if (e === undefined) return;
      const unique = cmd.stops.filter((f, i, arr) => arr.indexOf(f) === i);
      if (unique.length < 2) return;
      e.stops = unique;
      e.targetStopIndex = 0;
      e.state = 'IDLE';
      e.dir = 1;
      dropOrphanedRiders(world, e);
      replanWaiting(world, cfg);
      return;
    }
    case 'setPolicy': {
      const e = world.elevators.find((x) => x.id === cmd.elev);
      if (e !== undefined) e.policy = cmd.policy;
      return;
    }
    case 'addElevator':
      addElevator(world, cmd.spec);
      replanWaiting(world, cfg);
      return;
    case 'chooseUpgrade':
      if (cmd.kind === 'addElevator') addElevator(world, reliefSpec(world));
      else for (const e of world.elevators) e.capacity += 4;
      world.pendingUpgrade = null;
      world.dayEnded = false;
      replanWaiting(world, cfg);
      return;
    case 'pause':
      return;
  }
}
