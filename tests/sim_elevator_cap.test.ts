import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, MAX_ELEVATORS, UPGRADE_CHOICES } from '../src/config';
import { applyCommand, createWorld } from '../src/sim';
import { stepDayCycle } from '../src/systems/daycycle';
import type { ElevatorSpec } from '../src/types';

const spec: ElevatorSpec = {
  color: '#fff',
  stops: [1, 2, 3],
  capacity: 6,
  speed: 1,
  policy: 'SCAN',
  idleFloor: 1,
};

function fillToCap(count: number): ReturnType<typeof createWorld> {
  const w = createWorld(1, DEFAULT_CONFIG);
  while (w.elevators.length < count) {
    applyCommand(w, { t: 'addElevator', tick: 0, spec }, DEFAULT_CONFIG);
  }
  return w;
}

describe('elevator cap', () => {
  it('starts below the cap and fills up to it', () => {
    const w = createWorld(1, DEFAULT_CONFIG);
    expect(w.elevators.length).toBeLessThan(MAX_ELEVATORS);
    const capped = fillToCap(MAX_ELEVATORS);
    expect(capped.elevators.length).toBe(MAX_ELEVATORS);
  });

  it('ignores further addElevator commands at the cap', () => {
    const w = fillToCap(MAX_ELEVATORS);
    applyCommand(w, { t: 'addElevator', tick: 0, spec }, DEFAULT_CONFIG);
    applyCommand(w, { t: 'addElevator', tick: 0, spec }, DEFAULT_CONFIG);
    expect(w.elevators.length).toBe(MAX_ELEVATORS);
  });

  it('drops the add-elevator offer once capped but keeps the capacity choice', () => {
    const cfg = { ...DEFAULT_CONFIG, dayLengthTicks: 10 };
    const w = createWorld(1, cfg);
    while (w.elevators.length < MAX_ELEVATORS) {
      applyCommand(w, { t: 'addElevator', tick: 0, spec }, cfg);
    }
    w.tick = cfg.dayLengthTicks;
    stepDayCycle(w, cfg);
    expect(w.pendingUpgrade?.map((o) => o.kind)).toEqual(['addCapacity']);

    applyCommand(w, { t: 'chooseUpgrade', tick: w.tick, kind: 'addCapacity' }, cfg);
    expect(w.pendingUpgrade).toBeNull();
    expect(w.elevators.length).toBe(MAX_ELEVATORS);
  });

  it('offers both choices below the cap', () => {
    const cfg = { ...DEFAULT_CONFIG, dayLengthTicks: 10 };
    const w = createWorld(1, cfg); // two elevators
    w.tick = cfg.dayLengthTicks;
    stepDayCycle(w, cfg);
    expect(w.pendingUpgrade?.map((o) => o.kind)).toEqual(UPGRADE_CHOICES.map((o) => o.kind));
  });
});
