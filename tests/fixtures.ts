// Shared test fixtures — build minimal worlds without the full sim.

import type {
  Elevator,
  Floor,
  GameStats,
  Passenger,
  Phase,
  World,
  Zone,
} from '../src/types';

export function floor(id: number, zone: Zone, opts: Partial<Floor> = {}): Floor {
  const f: Floor = {
    id,
    name: opts.name ?? `${id}F`,
    zone,
    waiting: opts.waiting ?? [],
    pressure: opts.pressure ?? 0,
    capacity: opts.capacity ?? 10,
  };
  if (opts.special !== undefined) f.special = opts.special;
  return f;
}

export function elevator(id: number, stops: number[], opts: Partial<Elevator> = {}): Elevator {
  const start = opts.pos ?? stops[0] ?? 1;
  return {
    id,
    color: opts.color ?? '#fff',
    stops,
    capacity: opts.capacity ?? 8,
    speed: opts.speed ?? 1.5,
    load: opts.load ?? [],
    policy: opts.policy ?? 'SCAN',
    pos: start,
    posPrev: opts.posPrev ?? start,
    vel: opts.vel ?? 0,
    dir: opts.dir ?? 1,
    state: opts.state ?? 'IDLE',
    targetStopIndex: opts.targetStopIndex ?? 0,
    dwellUntilTick: opts.dwellUntilTick ?? 0,
    idleFloor: opts.idleFloor ?? stops[0] ?? 1,
  };
}

export function passenger(
  id: number,
  from: number,
  destZone: Zone,
  opts: Partial<Passenger> = {},
): Passenger {
  const p: Passenger = {
    id,
    from,
    destZone,
    dir: opts.dir ?? 1,
    group: opts.group ?? 1,
    patience: opts.patience ?? 3600,
    state: opts.state ?? 'WAIT',
    atFloor: opts.atFloor ?? from,
    plan: opts.plan ?? [],
    legIndex: opts.legIndex ?? 0,
  };
  if (opts.onElev !== undefined) p.onElev = opts.onElev;
  return p;
}

export function stats(opts: Partial<GameStats> = {}): GameStats {
  return {
    delivered: opts.delivered ?? 0,
    totalWaitTicks: opts.totalWaitTicks ?? 0,
    maxWaitTicks: opts.maxWaitTicks ?? 0,
    transfers: opts.transfers ?? 0,
    energy: opts.energy ?? 0,
  };
}

export function world(opts: Partial<World> = {}): World {
  return {
    tick: opts.tick ?? 0,
    seed: opts.seed ?? 1,
    day: opts.day ?? 1,
    phase: (opts.phase ?? 'morning') as Phase,
    dayEnded: opts.dayEnded ?? false,
    floors:
      opts.floors ??
      [floor(-1, 'special'), floor(1, 'lobby'), floor(2, 'office'), floor(3, 'office')],
    elevators: opts.elevators ?? [],
    passengers: opts.passengers ?? new Map(),
    nextPassengerId: opts.nextPassengerId ?? 1,
    stats: opts.stats ?? stats(),
    overPressureTicks: opts.overPressureTicks ?? new Map(),
    gameOver: opts.gameOver ?? null,
    pendingUpgrade: opts.pendingUpgrade ?? null,
  };
}
