import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { selectNextTarget, shouldStop, stopIndexForFloor } from '../src/dispatch';
import type { Leg } from '../src/types';
import { elevator, floor, passenger, world } from './fixtures';

const cfg = DEFAULT_CONFIG;

const leg = (elevatorId: number, board: number, alight: number, dir: 1 | -1): Leg => ({
  elevator: elevatorId,
  boardFloor: board,
  alightFloor: alight,
  rideDir: dir,
});

describe('stopIndexForFloor', () => {
  it('returns the index in the stop list, or -1 when absent', () => {
    const e = elevator(1, [1, 3, 5]);
    expect(stopIndexForFloor(e, 3)).toBe(1);
    expect(stopIndexForFloor(e, 4)).toBe(-1);
  });
});

describe('shouldStop', () => {
  it('SCAN stops for a same-direction board and an alight', () => {
    const boarder = passenger(1, 2, 'office', { plan: [leg(1, 2, 5, 1)] });
    const rider = passenger(2, 1, 'office', {
      state: 'RIDE',
      onElev: 1,
      plan: [leg(1, 1, 3, 1)],
    });
    const e = elevator(1, [1, 2, 3], { pos: 1, dir: 1, load: [2] });
    const w = world({
      floors: [
        floor(1, 'lobby'),
        floor(2, 'office', { waiting: [1] }),
        floor(3, 'office'),
      ],
      elevators: [e],
      passengers: new Map([
        [1, boarder],
        [2, rider],
      ]),
    });

    expect(shouldStop(w, e, 2)).toBe(true);
    expect(shouldStop(w, e, 3)).toBe(true);
  });

  it('SCAN ignores an opposite-direction board', () => {
    const down = passenger(1, 2, 'office', { plan: [leg(1, 2, 1, -1)] });
    const e = elevator(1, [1, 2, 3], { pos: 1, dir: 1 });
    const w = world({
      floors: [floor(1, 'lobby'), floor(2, 'office', { waiting: [1] }), floor(3, 'office')],
      elevators: [e],
      passengers: new Map([[1, down]]),
    });

    expect(shouldStop(w, e, 2)).toBe(false);
  });

  it('ALL_CALL stops regardless of board direction', () => {
    const down = passenger(1, 2, 'office', { plan: [leg(1, 2, 1, -1)] });
    const e = elevator(1, [1, 2, 3], { pos: 1, dir: 1, policy: 'ALL_CALL' });
    const w = world({
      floors: [floor(1, 'lobby'), floor(2, 'office', { waiting: [1] }), floor(3, 'office')],
      elevators: [e],
      passengers: new Map([[1, down]]),
    });

    expect(shouldStop(w, e, 2)).toBe(true);
  });

  it('is false for a floor outside the stop list even when a call exists there', () => {
    const p = passenger(1, 4, 'office', { plan: [leg(1, 4, 5, 1)] });
    const e = elevator(1, [1, 2, 3], { pos: 1, dir: 1 });
    const w = world({
      floors: [
        floor(1, 'lobby'),
        floor(2, 'office'),
        floor(3, 'office'),
        floor(4, 'office', { waiting: [1] }),
        floor(5, 'office'),
      ],
      elevators: [e],
      passengers: new Map([[1, p]]),
    });

    expect(stopIndexForFloor(e, 4)).toBe(-1);
    expect(shouldStop(w, e, 4)).toBe(false);
  });
});

describe('selectNextTarget (SCAN sweep)', () => {
  it('advances to the next requested stop in the current direction', () => {
    const near = passenger(1, 2, 'office', { plan: [leg(1, 2, 5, 1)] });
    const far = passenger(2, 4, 'office', { plan: [leg(1, 4, 5, 1)] });
    const e = elevator(1, [1, 2, 3, 4, 5], { pos: 1, dir: 1 });
    const w = world({
      floors: [
        floor(1, 'lobby'),
        floor(2, 'office', { waiting: [1] }),
        floor(3, 'office'),
        floor(4, 'office', { waiting: [2] }),
        floor(5, 'office'),
      ],
      elevators: [e],
      passengers: new Map([
        [1, near],
        [2, far],
      ]),
    });

    expect(selectNextTarget(w, e, cfg)).toEqual({ index: 1, dir: 1 });
  });

  it('passes floors with no call', () => {
    const p = passenger(1, 4, 'office', { plan: [leg(1, 4, 5, 1)] });
    const e = elevator(1, [1, 2, 3, 4, 5], { pos: 1, dir: 1 });
    const w = world({
      floors: [
        floor(1, 'lobby'),
        floor(2, 'office'),
        floor(3, 'office'),
        floor(4, 'office', { waiting: [1] }),
        floor(5, 'office'),
      ],
      elevators: [e],
      passengers: new Map([[1, p]]),
    });

    expect(selectNextTarget(w, e, cfg)).toEqual({ index: 3, dir: 1 });
  });

  it('reverses at the terminal when no calls are ahead', () => {
    const p = passenger(1, 2, 'office', { plan: [leg(1, 2, 5, 1)] });
    const e = elevator(1, [1, 2, 3, 4, 5], { pos: 5, dir: 1 });
    const w = world({
      floors: [
        floor(1, 'lobby'),
        floor(2, 'office', { waiting: [1] }),
        floor(3, 'office'),
        floor(4, 'office'),
        floor(5, 'office'),
      ],
      elevators: [e],
      passengers: new Map([[1, p]]),
    });

    expect(selectNextTarget(w, e, cfg)).toEqual({ index: 1, dir: -1 });
  });

  it('returns null (IDLE) when there are no calls in either direction', () => {
    const e = elevator(1, [1, 2, 3, 4, 5], { pos: 1, dir: 1 });
    const w = world({
      floors: [
        floor(1, 'lobby'),
        floor(2, 'office'),
        floor(3, 'office'),
        floor(4, 'office'),
        floor(5, 'office'),
      ],
      elevators: [e],
    });

    expect(selectNextTarget(w, e, cfg)).toBeNull();
  });

  it('falls back to any call so an opposite-direction queue is not stranded', () => {
    const down = passenger(1, 2, 'office', { plan: [leg(1, 2, 1, -1)] });
    const e = elevator(1, [1, 2, 3], { pos: 1, dir: 1 });
    const w = world({
      floors: [floor(1, 'lobby'), floor(2, 'office', { waiting: [1] }), floor(3, 'office')],
      elevators: [e],
      passengers: new Map([[1, down]]),
    });

    expect(shouldStop(w, e, 2)).toBe(false);
    expect(selectNextTarget(w, e, cfg)).toEqual({ index: 1, dir: 1 });
  });

  it('stops for an alight', () => {
    const rider = passenger(1, 1, 'office', {
      state: 'RIDE',
      onElev: 1,
      plan: [leg(1, 1, 3, 1)],
    });
    const e = elevator(1, [1, 2, 3], { pos: 1, dir: 1, load: [1] });
    const w = world({
      floors: [floor(1, 'lobby'), floor(2, 'office'), floor(3, 'office')],
      elevators: [e],
      passengers: new Map([[1, rider]]),
    });

    expect(selectNextTarget(w, e, cfg)).toEqual({ index: 2, dir: 1 });
  });

  it('excludes the current stop when leaving so a full car cannot stall', () => {
    const here = passenger(1, 1, 'office', { plan: [leg(1, 1, 3, 1)] });
    const ahead = passenger(2, 2, 'office', { plan: [leg(1, 2, 3, 1)] });
    const e = elevator(1, [1, 2, 3], { pos: 1, dir: 1 });
    const w = world({
      floors: [
        floor(1, 'lobby', { waiting: [1] }),
        floor(2, 'office', { waiting: [2] }),
        floor(3, 'office'),
      ],
      elevators: [e],
      passengers: new Map([
        [1, here],
        [2, ahead],
      ]),
    });

    expect(selectNextTarget(w, e, cfg, true)).toEqual({ index: 0, dir: 1 });
    expect(selectNextTarget(w, e, cfg, false)).toEqual({ index: 1, dir: 1 });
  });
});
