// Car movement state machine: IDLE -> MOVING -> DWELL, one fixed step per call.
// Mutates World only; no DOM. The central `step` owns the clock — this system
// never increments world.tick.

import { selectNextTarget } from '../dispatch';
import type { SimConfig, World } from '../types';

export function stepMovement(world: World, cfg: SimConfig): void {
  for (const e of world.elevators) {
    e.posPrev = e.pos;

    if (e.state === 'IDLE') {
      e.vel = 0;
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
        e.vel = 0;
        continue;
      }

      // Accelerate toward the target, capped by the speed that still allows a stop
      // exactly at it — a smooth, deterministic brake-to-target profile.
      const target = e.stops[e.targetStopIndex];
      const d = target - e.pos;
      const dt = 1 / cfg.simHz;
      const vmax = e.speed > 0 ? e.speed : 1;
      const accel = cfg.accel > 0 ? cfg.accel : 1;
      const desired = (d >= 0 ? 1 : -1) * Math.min(vmax, Math.sqrt(2 * accel * Math.abs(d)));
      const dv = desired - e.vel;
      const maxDv = accel * dt;
      e.vel += Math.max(-maxDv, Math.min(maxDv, dv));
      const move = e.vel * dt;

      if (Math.abs(move) >= Math.abs(d) || Math.abs(d) < 1e-9) {
        e.posPrev = e.pos;
        e.pos = target;
        e.vel = 0;
        e.state = 'DWELL';
        e.dwellUntilTick = world.tick + Math.round(cfg.dwellTime * cfg.simHz);
      } else {
        e.pos += move;
        e.dir = e.vel > 0 ? 1 : e.vel < 0 ? -1 : e.dir;
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
