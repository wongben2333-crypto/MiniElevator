// Per-tick congestion pressure + patience decay. Runs LAST each tick.
// Never touches world.tick — the pipeline owns the clock.

import { secToTicks } from '../config';
import type { SimConfig, World } from '../types';

export function stepPressure(world: World, cfg: SimConfig): void {
  for (const f of world.floors) {
    const people = f.waiting.reduce((s, id) => s + (world.passengers.get(id)?.group ?? 1), 0);
    f.pressure = Math.min(1, people / Math.max(1, f.capacity));

    const streak = world.overPressureTicks.get(f.id) ?? 0;
    if (f.pressure >= 1) {
      const next = streak + 1;
      world.overPressureTicks.set(f.id, next);
      if (world.gameOver === null && next >= cfg.pressureThresholdTicks) {
        world.gameOver = { floor: f.id };
      }
    } else {
      world.overPressureTicks.set(f.id, 0);
    }
  }

  const fullPatience = secToTicks(cfg.patience, cfg.simHz);
  for (const p of world.passengers.values()) {
    if (p.state !== 'WAIT' && p.state !== 'TRANSFER') continue;
    p.patience = Math.max(0, p.patience - 1);
    world.stats.totalWaitTicks += 1;
    const waited = fullPatience - p.patience;
    if (waited > world.stats.maxWaitTicks) world.stats.maxWaitTicks = waited;
  }
}
