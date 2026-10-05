// Boarding system: opens a dwelling car's doors — alight first, then board.
// Mutates World; the central step() owns tick advances. No DOM.

import { stopIndexForFloor } from '../dispatch';
import { getFloor, pendingAlight, pendingBoard } from '../queries';
import type { Elevator, SimConfig, World } from '../types';

/** Is there ANY work (alight or board, either direction) strictly ahead of `idx` along `dir`? */
function anyWorkAhead(world: World, e: Elevator, idx: number, dir: 1 | -1): boolean {
  for (let j = idx + dir; j >= 0 && j < e.stops.length; j += dir) {
    const f = e.stops[j];
    if (pendingAlight(world, e.id, f).length > 0) return true;
    if (pendingBoard(world, e.id, f, 1).length > 0) return true;
    if (pendingBoard(world, e.id, f, -1).length > 0) return true;
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
        p.onElev = undefined;
        floor.waiting.push(p.id);
        world.stats.transfers += 1;
      }
    }

    // Resolve the departure direction idempotently (no per-tick flapping). Commit
    // to `curDir` while ANY work lies strictly ahead; only at a turnaround — nothing
    // ahead and an opposite-direction queue waiting here — flip so the car boards it.
    const idx = stopIndexForFloor(e, floorId);
    const curDir: 1 | -1 = e.dir === 0 ? 1 : e.dir;
    const opposite: 1 | -1 = curDir === 1 ? -1 : 1;
    if (
      !anyWorkAhead(world, e, idx, curDir) &&
      pendingBoard(world, e.id, floorId, opposite).length > 0
    ) {
      e.dir = opposite;
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
