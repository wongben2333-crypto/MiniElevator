import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { stepBoarding } from '../src/systems/boarding';
import type { Leg } from '../src/types';
import { elevator, floor, passenger, world } from './fixtures';

const cfg = DEFAULT_CONFIG;

const leg = (elevatorId: number, board: number, alight: number, dir: 1 | -1): Leg => ({
  elevator: elevatorId,
  boardFloor: board,
  alightFloor: alight,
  rideDir: dir,
});

describe('stepBoarding — board and alight', () => {
  it('boards a direct passenger then delivers it on alight', () => {
    const p = passenger(1, 1, 'office', {
      group: 2,
      state: 'WAIT',
      atFloor: 1,
      plan: [leg(1, 1, 3, 1)],
    });
    const f1 = floor(1, 'lobby', { waiting: [1] });
    const f3 = floor(3, 'office');
    const e = elevator(1, [1, 3], { state: 'DWELL', targetStopIndex: 0, dir: 1, capacity: 8 });
    const w = world({
      tick: 5,
      floors: [f1, f3],
      elevators: [e],
      passengers: new Map([[1, p]]),
    });

    stepBoarding(w, cfg);

    expect(w.tick).toBe(5);
    expect(p.state).toBe('RIDE');
    expect(p.onElev).toBe(1);
    expect(e.load).toEqual([1]);
    expect(f1.waiting).toEqual([]);

    e.targetStopIndex = 1;
    stepBoarding(w, cfg);

    expect(p.state).toBe('DONE');
    expect(w.passengers.has(1)).toBe(false);
    expect(w.stats.delivered).toBe(2);
    expect(e.load).toEqual([]);
    expect(f3.waiting).not.toContain(1);
  });

  it('leaves a passenger waiting when the car is full, patience unchanged', () => {
    const rider = passenger(9, 1, 'office', {
      group: 2,
      state: 'RIDE',
      onElev: 1,
      atFloor: 1,
      plan: [leg(1, 1, 3, 1)],
    });
    const p = passenger(1, 1, 'office', {
      group: 1,
      patience: 500,
      state: 'WAIT',
      atFloor: 1,
      plan: [leg(1, 1, 3, 1)],
    });
    const f1 = floor(1, 'lobby', { waiting: [1] });
    const e = elevator(1, [1, 3], {
      state: 'DWELL',
      targetStopIndex: 0,
      dir: 1,
      capacity: 2,
      load: [9],
    });
    const w = world({
      floors: [f1, floor(3, 'office')],
      elevators: [e],
      passengers: new Map([
        [1, p],
        [9, rider],
      ]),
    });

    stepBoarding(w, cfg);

    expect(p.state).toBe('WAIT');
    expect(p.patience).toBe(500);
    expect(e.load).toEqual([9]);
    expect(f1.waiting).toContain(1);
  });

  it('skips a group that does not fit entirely, boarding none of it', () => {
    const p = passenger(1, 1, 'office', {
      group: 4,
      state: 'WAIT',
      atFloor: 1,
      plan: [leg(1, 1, 3, 1)],
    });
    const f1 = floor(1, 'lobby', { waiting: [1] });
    const e = elevator(1, [1, 3], {
      state: 'DWELL',
      targetStopIndex: 0,
      dir: 1,
      capacity: 3,
    });
    const w = world({
      floors: [f1, floor(3, 'office')],
      elevators: [e],
      passengers: new Map([[1, p]]),
    });

    stepBoarding(w, cfg);

    expect(e.load).toEqual([]);
    expect(p.state).toBe('WAIT');
    expect(f1.waiting).toContain(1);
  });

  it('alights before boarding so freed capacity admits a waiter', () => {
    const out = passenger(9, 1, 'office', {
      group: 2,
      state: 'RIDE',
      onElev: 1,
      atFloor: 1,
      plan: [leg(1, 1, 2, 1)],
    });
    const p = passenger(1, 2, 'office', {
      group: 2,
      state: 'WAIT',
      atFloor: 2,
      plan: [leg(1, 2, 3, 1)],
    });
    const f2 = floor(2, 'office', { waiting: [1] });
    const e = elevator(1, [1, 2, 3], {
      state: 'DWELL',
      targetStopIndex: 1,
      dir: 1,
      capacity: 2,
      load: [9],
    });
    const w = world({
      floors: [floor(1, 'lobby'), f2, floor(3, 'office')],
      elevators: [e],
      passengers: new Map([
        [1, p],
        [9, out],
      ]),
    });

    stepBoarding(w, cfg);

    expect(e.load).toEqual([1]);
    expect(p.state).toBe('RIDE');
    expect(out.state).toBe('DONE');
    expect(w.stats.delivered).toBe(2);
    expect(f2.waiting).not.toContain(1);
  });

  it('does not board an opposite-direction passenger mid-route when same-direction work lies ahead', () => {
    const down = passenger(1, 2, 'office', {
      state: 'WAIT',
      atFloor: 2,
      plan: [leg(1, 2, 1, -1)],
    });
    const up = passenger(2, 3, 'office', {
      state: 'WAIT',
      atFloor: 3,
      plan: [leg(1, 3, 5, 1)],
    });
    const f2 = floor(2, 'office', { waiting: [1] });
    const f3 = floor(3, 'office', { waiting: [2] });
    const e = elevator(1, [1, 2, 3], {
      state: 'DWELL',
      targetStopIndex: 1,
      dir: 1,
      capacity: 8,
    });
    const w = world({
      floors: [floor(1, 'lobby'), f2, f3],
      elevators: [e],
      passengers: new Map([
        [1, down],
        [2, up],
      ]),
    });

    stepBoarding(w, cfg);

    // The up-passenger ahead keeps the car heading up, so the down-passenger waits.
    expect(e.dir).toBe(1);
    expect(down.state).toBe('WAIT');
    expect(e.load).toEqual([]);
    expect(f2.waiting).toContain(1);
  });

  it('does nothing for a non-DWELL elevator', () => {
    const p = passenger(1, 1, 'office', {
      state: 'WAIT',
      atFloor: 1,
      plan: [leg(1, 1, 3, 1)],
    });
    const f1 = floor(1, 'lobby', { waiting: [1] });
    const e = elevator(1, [1, 3], {
      state: 'MOVING',
      targetStopIndex: 0,
      dir: 1,
      capacity: 8,
    });
    const w = world({
      floors: [f1, floor(3, 'office')],
      elevators: [e],
      passengers: new Map([[1, p]]),
    });

    stepBoarding(w, cfg);

    expect(p.state).toBe('WAIT');
    expect(e.load).toEqual([]);
    expect(f1.waiting).toContain(1);
  });

  it('skips a DWELL elevator whose target floor is not in the world', () => {
    const e = elevator(1, [1, 9], { state: 'DWELL', targetStopIndex: 1, dir: 1 });
    const w = world({ floors: [floor(1, 'lobby')], elevators: [e] });

    expect(() => stepBoarding(w, cfg)).not.toThrow();
    expect(e.load).toEqual([]);
  });

  it('drops a waiting id whose passenger is missing', () => {
    const f2 = floor(2, 'office', { waiting: [7] });
    const e = elevator(1, [1, 2, 3], { state: 'DWELL', targetStopIndex: 1, dir: 1 });
    const w = world({
      floors: [floor(1, 'lobby'), f2, floor(3, 'office')],
      elevators: [e],
    });

    stepBoarding(w, cfg);

    expect(f2.waiting).toEqual([]);
  });
});
