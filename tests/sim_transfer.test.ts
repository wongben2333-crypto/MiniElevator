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

const twoLegPlan = (): Leg[] => [leg(1, 1, 5, 1), leg(2, 5, 9, 1)];

describe('stepBoarding — transfers', () => {
  it('turns a 2-leg rider into TRANSFER at the shared floor', () => {
    const p = passenger(1, 1, 'office', {
      state: 'RIDE',
      onElev: 1,
      atFloor: 1,
      plan: twoLegPlan(),
      legIndex: 0,
    });
    const f5 = floor(5, 'office');
    const e1 = elevator(1, [1, 5], {
      state: 'DWELL',
      targetStopIndex: 1,
      dir: 1,
      load: [1],
    });
    const e2 = elevator(2, [5, 9], { state: 'IDLE', targetStopIndex: 0, dir: 1 });
    const w = world({
      floors: [floor(1, 'lobby'), f5, floor(9, 'retail')],
      elevators: [e1, e2],
      passengers: new Map([[1, p]]),
    });

    stepBoarding(w, cfg);

    expect(p.state).toBe('TRANSFER');
    expect(p.legIndex).toBe(1);
    expect(p.atFloor).toBe(5);
    expect(f5.waiting).toContain(1);
    expect(e1.load).toEqual([]);
    expect(w.stats.transfers).toBe(1);
    expect(w.passengers.has(1)).toBe(true);
  });

  it('boards the transfer onto the second elevator and delivers it, one transfer counted', () => {
    const p = passenger(1, 1, 'office', {
      state: 'RIDE',
      onElev: 1,
      atFloor: 1,
      plan: twoLegPlan(),
      legIndex: 0,
    });
    const f5 = floor(5, 'office');
    const e1 = elevator(1, [1, 5], {
      state: 'DWELL',
      targetStopIndex: 1,
      dir: 1,
      load: [1],
    });
    const e2 = elevator(2, [5, 9], { state: 'IDLE', targetStopIndex: 0, dir: 1 });
    const w = world({
      floors: [floor(1, 'lobby'), f5, floor(9, 'retail')],
      elevators: [e1, e2],
      passengers: new Map([[1, p]]),
    });

    // Leg 1: alight at the shared floor and become a transfer.
    stepBoarding(w, cfg);
    expect(p.state).toBe('TRANSFER');

    // Leg 2: the second elevator is now dwelling at the shared floor.
    e1.state = 'IDLE';
    e2.state = 'DWELL';
    stepBoarding(w, cfg);

    expect(p.state).toBe('RIDE');
    expect(p.onElev).toBe(2);
    expect(e2.load).toEqual([1]);
    expect(f5.waiting).not.toContain(1);
    expect(w.stats.transfers).toBe(1);

    // Final hop: alight at the destination and become DONE.
    e2.targetStopIndex = 1;
    stepBoarding(w, cfg);

    expect(p.state).toBe('DONE');
    expect(w.passengers.has(1)).toBe(false);
    expect(w.stats.delivered).toBe(1);
    expect(w.stats.transfers).toBe(1);
  });

  it('keeps a transfer waiting when its second elevator does not exist', () => {
    const p = passenger(1, 1, 'office', {
      state: 'RIDE',
      onElev: 1,
      atFloor: 1,
      plan: twoLegPlan(),
      legIndex: 0,
    });
    const f5 = floor(5, 'office');
    const e1 = elevator(1, [1, 5], {
      state: 'DWELL',
      targetStopIndex: 1,
      dir: 1,
      load: [1],
    });
    const w = world({
      floors: [floor(1, 'lobby'), f5, floor(9, 'retail')],
      elevators: [e1],
      passengers: new Map([[1, p]]),
    });

    stepBoarding(w, cfg);
    expect(() => stepBoarding(w, cfg)).not.toThrow();

    expect(p.state).toBe('TRANSFER');
    expect(p.legIndex).toBe(1);
    expect(f5.waiting).toContain(1);
    expect(w.passengers.has(1)).toBe(true);
    expect(w.stats.transfers).toBe(1);
  });
});
