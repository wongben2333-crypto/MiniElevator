// Car movement state machine: IDLE -> MOVING -> DWELL, one fixed step per call.
// Mutates World only; no DOM. The central `step` owns the clock — this system
// never increments world.tick.

import { selectNextTarget } from '../dispatch';
import type { SimConfig, World } from '../types';

export function stepMovement(world: World, cfg: SimConfig): void {
  for (const e of world.elevators) {
    e.posPrev = e.pos;

    if (e.state === 'IDLE') {
      const t = selectNextTarget(world, e, cfg, true);
      if (t !== null) {
        e.dir = t.dir;
        e.targetStopIndex = t.index;
        e.state = 'MOVING';
      }
    }

    if (e.state === 'MOVING') {
      if (e.targetStopIndex < 0 || e.targetStopIndex >= e.stops.length) {
        e.state = 'IDLE';
        continue;
      }

      const target = e.stops[e.targetStopIndex];
      const step = e.speed / cfg.simHz;
      const d = target - e.pos;

      if (Math.abs(d) <= step) {
        e.posPrev = e.pos;
        e.pos = target;
        e.state = 'DWELL';
        e.dwellUntilTick = world.tick + Math.round(cfg.dwellTime * cfg.simHz);
      } else {
        e.pos += Math.sign(d) * step;
        e.dir = d > 0 ? 1 : -1;
      }
    }

    if (e.state === 'DWELL' && world.tick >= e.dwellUntilTick) {
      const t = selectNextTarget(world, e, cfg, false);
      if (t === null) {
        e.state = 'IDLE';
      } else {
        e.dir = t.dir;
        e.targetStopIndex = t.index;
        e.state = 'MOVING';
      }
    }

    world.stats.energy += Math.abs(e.pos - e.posPrev);
  }
}
