// Elevator dispatch: which stop to serve next, where to stop, under which policy.
// Pure reads over World through queries.ts. No mutation, no DOM.

import type { Elevator, FloorId, SimConfig, World } from './types';
import { pendingAlight, pendingBoard } from './queries';

/** Normalize a direction for scanning: idle (0) sweeps as +1. */
function normalizeDir(dir: Elevator['dir']): 1 | -1 {
  return dir === 0 ? 1 : dir;
}

/** Index of `floor` in the elevator's stop list, or -1 when not served. */
export function stopIndexForFloor(elev: Elevator, floor: FloorId): number {
  return elev.stops.indexOf(floor);
}

/** Whether the elevator should open its doors at `floor` under its policy. */
export function shouldStop(world: World, elev: Elevator, floor: FloorId): boolean {
  if (stopIndexForFloor(elev, floor) === -1) return false;

  const dir = normalizeDir(elev.dir);
  const alight = pendingAlight(world, elev.id, floor).length > 0;

  switch (elev.policy) {
    case 'SCAN':
    case 'ZONE':
      return alight || pendingBoard(world, elev.id, floor, dir).length > 0;
    case 'ALL_CALL':
      return (
        alight ||
        pendingBoard(world, elev.id, floor, 1).length > 0 ||
        pendingBoard(world, elev.id, floor, -1).length > 0
      );
    case 'UP_PEAK':
      if (world.phase !== 'morning') {
        return alight || pendingBoard(world, elev.id, floor, dir).length > 0;
      }
      // Morning: unload anywhere, collect descending riders, and pick up
      // ascending riders only at the idle (lobby) floor.
      return (
        alight ||
        pendingBoard(world, elev.id, floor, -1).length > 0 ||
        (pendingBoard(world, elev.id, floor, 1).length > 0 && floor === elev.idleFloor)
      );
    case 'DOWN_PEAK':
      if (world.phase !== 'evening') {
        return alight || pendingBoard(world, elev.id, floor, dir).length > 0;
      }
      // Evening: mirror of UP_PEAK — unload anywhere, collect ascending riders,
      // and pick up descending riders only at the idle floor.
      return (
        alight ||
        pendingBoard(world, elev.id, floor, 1).length > 0 ||
        (pendingBoard(world, elev.id, floor, -1).length > 0 && floor === elev.idleFloor)
      );
  }
}

/**
 * LOOK/SCAN sweep: the nearest servable stop ahead in `elev.dir`; failing that,
 * the nearest servable stop in the opposite direction (the car will reverse);
 * otherwise null, meaning the car is idle.
 */
export function selectNextTarget(
  world: World,
  elev: Elevator,
  cfg: SimConfig,
  includeCurrent = true,
): { index: number; dir: 1 | -1 } | null {
  void cfg;
  const dir = normalizeDir(elev.dir);
  const ordered = elev.stops
    .map((floor, index) => ({ floor, index }))
    .sort((a, b) => a.floor - b.floor);

  const aheadOf = (floor: FloorId, scanDir: 1 | -1, includeCurrent: boolean): boolean => {
    if (scanDir === 1) return includeCurrent ? floor >= elev.pos : floor > elev.pos;
    return includeCurrent ? floor <= elev.pos : floor < elev.pos;
  };

  const policyPick = (floor: FloorId): boolean => shouldStop(world, elev, floor);
  // Fallback used only when policy finds nothing: any floor with any work, so a
  // car never strands an opposite-direction queue (e.g. down-calls at a terminal).
  const anyWork = (floor: FloorId): boolean =>
    pendingAlight(world, elev.id, floor).length > 0 ||
    pendingBoard(world, elev.id, floor, 1).length > 0 ||
    pendingBoard(world, elev.id, floor, -1).length > 0;

  const scan = (
    scanDir: 1 | -1,
    includeCurrent: boolean,
    accept: (floor: FloorId) => boolean,
  ): number | null => {
    const list = scanDir === 1 ? ordered : [...ordered].reverse();
    for (const stop of list) {
      if (aheadOf(stop.floor, scanDir, includeCurrent) && accept(stop.floor)) return stop.index;
    }
    return null;
  };

  const back = dir === 1 ? -1 : 1;
  // LOOK sweep: commit to the current direction while ANY work (either direction)
  // still lies ahead; only reverse once nothing remains ahead. Reversing early let a
  // car oscillate in one sub-region while a queue at the far terminal starved.
  // Policy work is still preferred within a direction.
  const a1 = scan(dir, includeCurrent, policyPick);
  if (a1 !== null) return { index: a1, dir };
  const a2 = scan(dir, includeCurrent, anyWork);
  if (a2 !== null) return { index: a2, dir };
  const b1 = scan(back, false, policyPick);
  if (b1 !== null) return { index: b1, dir: back };
  const b2 = scan(back, false, anyWork);
  if (b2 !== null) return { index: b2, dir: back };
  return null;
}
