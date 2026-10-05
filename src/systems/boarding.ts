// Boarding system: opens a dwelling car's doors — alight first, then board.
// Mutates World; the central step() owns tick advances. No DOM.

import type { SimConfig, World } from '../types';
import { getFloor, pendingAlight, pendingBoard } from '../queries';

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

    // BOARD SECOND — groups board atomically or not at all.
    const dir = e.dir === 0 ? 1 : e.dir;
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

    // Guard: drop waiting ids whose passenger no longer exists.
    floor.waiting = floor.waiting.filter((id) => world.passengers.has(id));
  }
}
