import { describe, expect, it } from 'vitest';
import type { Leg } from '../src/types';
import { floorsMatching, nextLeg, pendingAlight, pendingBoard } from '../src/queries';
import { elevator, floor, passenger, world } from './fixtures';

const leg = (elevatorId: number, board: number, alight: number, dir: 1 | -1): Leg => ({
  elevator: elevatorId,
  boardFloor: board,
  alightFloor: alight,
  rideDir: dir,
});

describe('queries', () => {
  it('floorsMatching returns every floor of the zone', () => {
    const w = world({
      floors: [floor(1, 'lobby'), floor(2, 'office'), floor(3, 'office'), floor(9, 'retail')],
    });
    expect(floorsMatching(w, 'office').map((f) => f.id)).toEqual([2, 3]);
    expect(floorsMatching(w, 'retail').map((f) => f.id)).toEqual([9]);
  });

  it('nextLeg returns plan[legIndex] and undefined past the end', () => {
    const l = leg(1, 1, 3, 1);
    const p = passenger(1, 1, 'office', { plan: [l], legIndex: 0 });
    expect(nextLeg(p)).toBe(l);
    p.legIndex = 1;
    expect(nextLeg(p)).toBeUndefined();
  });

  it('pendingBoard matches only passengers whose next leg boards this elevator/floor/dir', () => {
    const p1 = passenger(1, 1, 'office', { plan: [leg(1, 1, 3, 1)] });
    const p2 = passenger(2, 1, 'office', { plan: [leg(2, 1, 3, 1)] });
    const p3 = passenger(3, 1, 'office', { plan: [leg(1, 1, 4, -1)] });
    const w = world({
      floors: [floor(1, 'lobby', { waiting: [1, 2, 3] })],
      passengers: new Map([
        [1, p1],
        [2, p2],
        [3, p3],
      ]),
    });
    expect(pendingBoard(w, 1, 1, 1).map((p) => p.id)).toEqual([1]);
    expect(pendingBoard(w, 2, 1, 1).map((p) => p.id)).toEqual([2]);
    expect(pendingBoard(w, 1, 1, -1).map((p) => p.id)).toEqual([3]);
  });

  it('pendingAlight finds riders whose current leg alights here', () => {
    const rider = passenger(1, 1, 'office', {
      state: 'RIDE',
      onElev: 1,
      plan: [leg(1, 1, 3, 1)],
      atFloor: 1,
    });
    const through = passenger(2, 1, 'office', {
      state: 'RIDE',
      onElev: 1,
      plan: [leg(1, 1, 5, 1)],
      atFloor: 1,
    });
    const w = world({
      elevators: [elevator(1, [1, 3, 5], { load: [1, 2] })],
      passengers: new Map([
        [1, rider],
        [2, through],
      ]),
    });
    expect(pendingAlight(w, 1, 3).map((p) => p.id)).toEqual([1]);
    expect(pendingAlight(w, 1, 5).map((p) => p.id)).toEqual([2]);
  });
});
