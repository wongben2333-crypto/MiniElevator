import { describe, expect, it } from 'vitest';
import type { Leg, SimConfig } from '../src/types';
import { DEFAULT_CONFIG } from '../src/config';
import { findPlanBFS } from '../src/route';
import { elevator, floor, passenger, world } from './fixtures';

function cfg(over: Partial<SimConfig> = {}): SimConfig {
  return { ...DEFAULT_CONFIG, routeMode: 'bfs', ...over };
}

function expectPlan(plan: Leg[] | null): Leg[] {
  expect(plan).not.toBeNull();
  if (plan === null) throw new Error('expected a plan, got null');
  return plan;
}

describe('findPlanBFS', () => {
  it('returns a single-leg direct plan between adjacent stops', () => {
    const w = world({
      floors: [floor(1, 'lobby'), floor(2, 'office')],
      elevators: [elevator(1, [1, 2], { pos: 1, dir: 1 })],
    });
    const plan = expectPlan(findPlanBFS(w, passenger(1, 1, 'office'), cfg()));

    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({ elevator: 1, boardFloor: 1, alightFloor: 2, rideDir: 1 });
  });

  it('returns null when no elevator reaches the destination zone', () => {
    const w = world({
      floors: [floor(1, 'lobby'), floor(5, 'office')],
      elevators: [elevator(1, [1, 2, 3], { pos: 1, dir: 1 })],
    });
    expect(findPlanBFS(w, passenger(1, 1, 'office'), cfg())).toBeNull();
  });

  it('chains two elevators that share a floor into a two-leg plan', () => {
    const w = world({
      floors: [floor(1, 'lobby'), floor(3, 'office'), floor(7, 'retail')],
      elevators: [
        elevator(1, [1, 2, 3], { pos: 1, dir: 1 }),
        elevator(2, [3, 7], { pos: 3, dir: 1 }),
      ],
    });
    const plan = expectPlan(findPlanBFS(w, passenger(1, 1, 'retail'), cfg()));

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ elevator: 1, boardFloor: 1, alightFloor: 3 });
    expect(plan[1]).toMatchObject({ elevator: 2, boardFloor: 3, alightFloor: 7 });
  });

  it('prefers one transfer over two transfers even when it rides more stops', () => {
    const w = world({
      floors: [floor(1, 'lobby'), floor(5, 'office'), floor(9, 'retail')],
      elevators: [
        // One-transfer route with many stops: 1 -> 5 -> 9.
        elevator(10, [1, 2, 3, 4, 5], { pos: 1, dir: 1 }),
        elevator(11, [5, 6, 7, 8, 9], { pos: 5, dir: 1 }),
        // Two-transfer route with fewer stops: 1 -> 3 -> 5 -> 9.
        elevator(20, [1, 3], { pos: 1, dir: 1 }),
        elevator(21, [3, 5], { pos: 3, dir: 1 }),
        elevator(22, [5, 9], { pos: 5, dir: 1 }),
      ],
    });
    const plan = expectPlan(findPlanBFS(w, passenger(1, 1, 'retail'), cfg()));

    expect(plan).toHaveLength(2);
  });

  it('produces contiguous legs (leg[i].alightFloor === leg[i+1].boardFloor)', () => {
    const w = world({
      floors: [floor(1, 'lobby'), floor(9, 'retail')],
      elevators: [
        elevator(1, [1, 3], { pos: 1, dir: 1 }),
        elevator(2, [3, 5], { pos: 3, dir: 1 }),
        elevator(3, [5, 9], { pos: 5, dir: 1 }),
      ],
    });
    const plan = expectPlan(findPlanBFS(w, passenger(1, 1, 'retail'), cfg()));

    expect(plan.length).toBeGreaterThanOrEqual(2);
    expect(plan[plan.length - 1].alightFloor).toBe(9);
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i].boardFloor).toBe(plan[i - 1].alightFloor);
    }
  });

  it('reports rideDir -1 when the destination lies in reverse stop order', () => {
    const w = world({
      floors: [floor(1, 'office'), floor(2, 'office'), floor(3, 'lobby')],
      elevators: [elevator(1, [1, 2, 3], { pos: 1, dir: 1 })],
    });
    const plan = expectPlan(findPlanBFS(w, passenger(1, 3, 'office'), cfg()));

    expect(plan).toHaveLength(1);
    expect(plan[0].boardFloor).toBe(3);
    expect(plan[0].alightFloor).toBe(2);
    expect(plan[0].rideDir).toBe(-1);
  });
});
