import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { stepBoarding } from '../src/systems/boarding';
import { stepMovement } from '../src/systems/movement';
import type { Leg, SimConfig } from '../src/types';
import { elevator, floor, passenger, world } from './fixtures';

const cfg = DEFAULT_CONFIG;

const leg = (id: number, board: number, alight: number, dir: 1 | -1): Leg => ({
  elevator: id,
  boardFloor: board,
  alightFloor: alight,
  rideDir: dir,
});

/**
 * Regression for the terminal-stranding BLOCKER. A car must keep sweeping in its
 * travel direction while ANY work lies ahead; reversing early let it oscillate in a
 * sub-region while an opposite-direction queue at the far terminal starved. This is
 * the shipped elevator-0 stop list plus sustained lobby->2F demand and one down-call
 * at the top terminal (floor 5).
 */
function runSustainedUpDemand(dwellSec: number, maxTicks: number): { served: boolean; tick: number } {
  const c: SimConfig = { ...cfg, dwellTime: dwellSec };
  const down = passenger(1, 5, 'lobby', { state: 'WAIT', atFloor: 5, plan: [leg(1, 5, 1, -1)] });
  const e = elevator(1, [-1, 1, 2, 3, 4, 5], { pos: 1, dir: 1, capacity: 10 });
  const floors = [
    floor(-1, 'special'),
    floor(1, 'lobby'),
    floor(2, 'office'),
    floor(3, 'office'),
    floor(4, 'office'),
    floor(5, 'office'),
  ];
  floors[5].waiting.push(1);
  const w = world({ floors, elevators: [e], passengers: new Map([[1, down]]) });

  let nextId = 2;
  for (let i = 0; i < maxTicks; i += 1) {
    const f1 = w.floors[1];
    if (!f1.waiting.some((id) => w.passengers.get(id)?.state === 'WAIT')) {
      const p = passenger(nextId++, 1, 'office', { state: 'WAIT', atFloor: 1, plan: [leg(1, 1, 2, 1)] });
      w.passengers.set(p.id, p);
      f1.waiting.push(p.id);
    }
    stepMovement(w, c);
    stepBoarding(w, c);
    w.tick += 1;
    const d = w.passengers.get(1);
    if (d === undefined || d.state !== 'WAIT') return { served: true, tick: w.tick };
  }
  return { served: false, tick: w.tick };
}

describe('terminal starvation (LOOK sweep)', () => {
  it('serves an opposite-direction queue at the far terminal under sustained demand', () => {
    const r = runSustainedUpDemand(cfg.dwellTime, 60_000);
    expect(r.served, `down-call never served after ${r.tick} ticks`).toBe(true);
  });

  it('is independent of dwell-length parity', () => {
    for (const dwell of [149 / 60, 150 / 60, 151 / 60]) {
      const r = runSustainedUpDemand(dwell, 60_000);
      expect(r.served, `dwell=${dwell} stranded`).toBe(true);
    }
  });
});
