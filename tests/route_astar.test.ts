import { describe, expect, it } from 'vitest';
import type { Elevator, FloorId, Leg, PNode, SimConfig, World } from '../src/types';
import { DEFAULT_CONFIG } from '../src/config';
import { estWait, findPlanAStar, findPlanBFS, heuristic } from '../src/route';
import { elevator, floor, passenger, world } from './fixtures';

function cfg(over: Partial<SimConfig> = {}): SimConfig {
  return { ...DEFAULT_CONFIG, routeMode: 'astar', ...over };
}

function expectPlan(plan: Leg[] | null): Leg[] {
  expect(plan).not.toBeNull();
  if (plan === null) throw new Error('expected a plan, got null');
  return plan;
}

function speedOf(e: Elevator): number {
  return e.speed > 0 ? e.speed : 1;
}

function keyOf(node: PNode): string {
  return node.kind === 'floor' ? `f:${node.floor}` : `e:${node.elev}:${node.floor}`;
}

/** True time cost of a collapsed plan, using the same edge model as A*. */
function planCost(w: World, plan: Leg[], c: SimConfig, from: FloorId): number {
  let total = 0;
  for (const leg of plan) {
    const e = w.elevators.find((x) => x.id === leg.elevator);
    if (e === undefined) continue;
    total += estWait(w, e, leg.boardFloor, c);
    total += leg.boardFloor === from ? 0 : c.transferPenalty;
    total += c.alightTime;
    const bi = e.stops.indexOf(leg.boardFloor);
    const ai = e.stops.indexOf(leg.alightFloor);
    const lo = Math.min(bi, ai);
    const hi = Math.max(bi, ai);
    for (let k = lo; k < hi; k += 1) {
      total += (c.floorTravelBase * Math.abs(e.stops[k + 1] - e.stops[k])) / speedOf(e) + c.dwellTime;
    }
  }
  return total;
}

interface Lite {
  to: PNode;
  w: number;
}

/** Reference edge expansion mirroring the documented model, for admissibility checks. */
function expand(w: World, c: SimConfig, root: FloorId, node: PNode): Lite[] {
  const out: Lite[] = [];
  if (node.kind === 'floor') {
    for (const e of w.elevators) {
      if (!e.stops.includes(node.floor)) continue;
      const weight = estWait(w, e, node.floor, c) + (node.floor === root ? 0 : c.transferPenalty);
      out.push({ to: { kind: 'elev', floor: node.floor, elev: e.id }, w: weight });
    }
    return out;
  }
  const e = w.elevators.find((x) => x.id === node.elev);
  if (e === undefined) return out;
  out.push({ to: { kind: 'floor', floor: node.floor }, w: c.alightTime });
  const idx = e.stops.indexOf(node.floor);
  if (idx < 0) return out;
  for (const adj of [idx - 1, idx + 1]) {
    if (adj < 0 || adj >= e.stops.length) continue;
    const next = e.stops[adj];
    const weight = (c.floorTravelBase * Math.abs(next - node.floor)) / speedOf(e) + c.dwellTime;
    out.push({ to: { kind: 'elev', floor: next, elev: e.id }, w: weight });
  }
  return out;
}

/** Exact shortest remaining cost from every node when starting at `root`. */
function refDistances(w: World, c: SimConfig, root: FloorId): Map<string, number> {
  const dist = new Map<string, number>();
  const start: PNode = { kind: 'floor', floor: root };
  const startKey = keyOf(start);
  dist.set(startKey, 0);
  const queue: Array<{ node: PNode; key: string; d: number }> = [{ node: start, key: startKey, d: 0 }];
  const done = new Set<string>();
  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d);
    const cur = queue.shift();
    if (cur === undefined) break;
    if (done.has(cur.key)) continue;
    done.add(cur.key);
    for (const edge of expand(w, c, root, cur.node)) {
      const tk = keyOf(edge.to);
      const nd = cur.d + edge.w;
      if (nd < (dist.get(tk) ?? Infinity)) {
        dist.set(tk, nd);
        queue.push({ node: edge.to, key: tk, d: nd });
      }
    }
  }
  return dist;
}

describe('findPlanAStar', () => {
  it('returns a direct plan when a direct route exists', () => {
    const w = world({
      floors: [floor(1, 'lobby'), floor(2, 'office')],
      elevators: [elevator(1, [1, 2], { pos: 1, dir: 1 })],
    });
    const plan = expectPlan(findPlanAStar(w, passenger(1, 1, 'office'), cfg()));

    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({ elevator: 1, boardFloor: 1, alightFloor: 2, rideDir: 1 });
  });

  it('avoids a transfer when a longer direct ride is cheaper', () => {
    const w = world({
      floors: [floor(1, 'lobby'), floor(3, 'office'), floor(6, 'retail')],
      elevators: [
        // Direct but stops at every floor.
        elevator(1, [1, 2, 3, 4, 5, 6], { pos: 1, dir: 1 }),
        // Shorter ride, but forces a transfer.
        elevator(2, [1, 3], { pos: 1, dir: 1 }),
        elevator(3, [3, 6], { pos: 3, dir: 1 }),
      ],
    });
    const plan = expectPlan(findPlanAStar(w, passenger(1, 1, 'retail'), cfg()));

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ elevator: 1, boardFloor: 1, alightFloor: 6 });
  });

  it('returns null for an unreachable destination zone', () => {
    const w = world({
      floors: [floor(1, 'lobby'), floor(5, 'office')],
      elevators: [elevator(1, [1, 2, 3], { pos: 1, dir: 1 })],
    });
    expect(findPlanAStar(w, passenger(1, 1, 'office'), cfg())).toBeNull();
  });

  it('estimates a smaller wait when the elevator is already heading to the floor', () => {
    const w = world({});
    const toward = estWait(w, elevator(1, [1, 2, 3, 4, 5], { pos: 3, dir: 1 }), 5, cfg());
    const away = estWait(w, elevator(1, [1, 2, 3, 4, 5], { pos: 3, dir: -1 }), 5, cfg());
    const closer = estWait(w, elevator(1, [1, 2, 3, 4, 5], { pos: 4, dir: 1 }), 5, cfg());

    expect(toward).toBeGreaterThanOrEqual(0);
    expect(toward).toBeLessThan(away);
    expect(closer).toBeLessThan(toward);
  });

  it('never overestimates the true remaining cost on a sample graph', () => {
    const w = world({
      floors: [floor(1, 'lobby'), floor(3, 'office'), floor(6, 'retail')],
      elevators: [
        elevator(1, [1, 2, 3, 4, 5, 6], { pos: 1, dir: 1 }),
        elevator(2, [1, 3], { pos: 1, dir: 1 }),
        elevator(3, [3, 6], { pos: 3, dir: 1 }),
      ],
    });
    const c = cfg();
    const goals = new Set<FloorId>([6]);

    expect(heuristic({ kind: 'floor', floor: 1 }, goals, c)).toBeCloseTo((5 * 0.5) / 2, 10);

    const samples: PNode[] = [
      { kind: 'floor', floor: 1 },
      { kind: 'floor', floor: 3 },
      { kind: 'floor', floor: 4 },
      { kind: 'elev', floor: 2, elev: 1 },
      { kind: 'elev', floor: 4, elev: 1 },
    ];
    for (const node of samples) {
      const dist = refDistances(w, c, node.floor);
      const trueRemaining = dist.get('f:6') ?? Infinity;
      if (Number.isFinite(trueRemaining)) {
        expect(heuristic(node, goals, c)).toBeLessThanOrEqual(trueRemaining + 1e-9);
      }
    }
  });

  it('finds a plan no more expensive than BFS on the same graph', () => {
    const w = world({
      floors: [floor(1, 'lobby'), floor(10, 'retail')],
      elevators: [
        // Direct but slow (stops everywhere).
        elevator(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { pos: 1, dir: 1 }),
        // Cheaper transfer route.
        elevator(2, [1, 5], { pos: 1, dir: 1 }),
        elevator(3, [5, 10], { pos: 5, dir: 1 }),
      ],
    });
    const p = passenger(1, 1, 'retail');
    const astar = expectPlan(findPlanAStar(w, p, cfg()));
    const bfs = expectPlan(findPlanBFS(w, p, cfg({ routeMode: 'bfs' })));

    const astarCost = planCost(w, astar, cfg(), 1);
    const bfsCost = planCost(w, bfs, cfg(), 1);

    expect(bfs).toHaveLength(1); // BFS minimizes legs, ignores time.
    expect(astar).toHaveLength(2); // A* accepts a transfer to save time.
    expect(astarCost).toBeLessThanOrEqual(bfsCost + 1e-9);
  });
});
