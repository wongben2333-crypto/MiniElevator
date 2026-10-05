// Boarding system: opens a dwelling car's doors — alight first, then board.
// Mutates World; the central step() owns tick advances. No DOM.

import { stopIndexForFloor } from '../dispatch';
import { getFloor, pendingAlight, pendingBoard } from '../queries';
import type { Elevator, SimConfig, World } from '../types';

/** Is there same-direction work at stop `idx` or further along `dir`? */
function sameDirWorkHereOrAhead(world: World, e: Elevator, idx: number, dir: 1 | -1): boolean {
  for (let j = idx; j >= 0 && j < e.stops.length; j += dir) {
    const f = e.stops[j];
    if (pendingAlight(world, e.id, f).length > 0) return true;
    if (pendingBoard(world, e.id, f, dir).length > 0) return true;
  }
  return false;
}

export function stepBoarding(world: World, cfg: SimConfig): void {
  void cfg;
  for (const e of world.elevators) {
    if (e.state !== 'DWELL') continue;
    const floorId = e.stops[e.targetStopIndex];
    const floor = getFloor(world, floorId);
    if (floor === undefined) continue;

    // ALIGHT FIRST — frees capacity before boarding.
    for (const p of pendingAlight(world, e.id, floorId)) {
      e.load = e.load.filter((id) => id !== p.id);
      if (p.plan.length === 0 || p.legIndex >= p.plan.length - 1) {
        p.state = 'DONE';
        world.passengers.delete(p.id);
        world.stats.delivered += p.group;
      } else {
        p.legIndex += 1;
        p.state = 'TRANSFER';
        p.atFloor = floorId;
        floor.waiting.push(p.id);
        world.stats.transfers += 1;
      }
    }

    // Resolve the departure direction: keep travelling the same way when there is
    // same-direction work here or ahead; otherwise this is a turnaround — reverse,
    // so a car at a terminal can pick up the opposite-direction queue.
    const idx = stopIndexForFloor(e, floorId);
    const curDir: 1 | -1 = e.dir === 0 ? 1 : e.dir;
    if (!sameDirWorkHereOrAhead(world, e, idx, curDir)) {
      e.dir = curDir === 1 ? -1 : 1;
    }

    // BOARD SECOND — groups board atomically or not at all; ALL_CALL ignores direction.
    const dirs: Array<1 | -1> = e.policy === 'ALL_CALL' ? [1, -1] : [e.dir === 0 ? 1 : e.dir];
    for (const dir of dirs) {
      for (const p of pendingBoard(world, e.id, floorId, dir)) {
        const used = e.load.reduce(
          (sum, id) => sum + (world.passengers.get(id)?.group ?? 0),
          0,
        );
        if (used + p.group > e.capacity) continue;
        floor.waiting = floor.waiting.filter((id) => id !== p.id);
        p.state = 'RIDE';
        p.onElev = e.id;
        e.load.push(p.id);
      }
    }

    // Guard: drop waiting ids whose passenger no longer exists.
    floor.waiting = floor.waiting.filter((id) => world.passengers.has(id));
  }
}
