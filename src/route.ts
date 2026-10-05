// Passenger pathfinding over the (floor, elevator) graph. See docs/03-pathfinding.md.
// Pure + deterministic: no DOM, no randomness, imports only ./types, ./config, ./queries.

import type {
  Elevator,
  FloorId,
  Leg,
  Passenger,
  PNode,
  RouteMode,
  SimConfig,
  World,
} from './types';
import { floorsMatching, getElevator } from './queries';

/** BFS lexicographic weight: each boarding (new leg) dwarfs any number of stops. */
const BFS_BOARD = 1_000_000;

function speedOf(e: Elevator): number {
  return e.speed > 0 ? e.speed : 1;
}

function nodeKey(n: PNode): string {
  return n.kind === 'floor' ? `f:${n.floor}` : `e:${n.elev}:${n.floor}`;
}

/**
 * Geometric estimate (seconds) until elevator `e` next reaches `floor`.
 * Monotonic: a car closer to, or already heading toward, the floor waits less.
 */
export function estWait(_world: World, elev: Elevator, floor: FloorId, cfg: SimConfig): number {
  const stops = elev.stops;
  const unit = cfg.floorTravelBase / speedOf(elev);
  const fallback = Math.max(0, Math.abs(elev.pos - floor) * unit);

  if (stops.length === 0 || elev.dir === 0) return fallback;

  const target = stops.indexOf(floor);
  if (target < 0) return fallback;

  let here = stops.indexOf(elev.pos);
  if (here < 0) {
    // Fractional position between stops (assumes ascending stop order): snap down.
    here = 0;
    for (let i = 0; i < stops.length; i += 1) {
      if (stops[i] <= elev.pos) here = i;
      else break;
    }
  }

  const ahead = elev.dir === 1 ? target >= here : target <= here;
  const top = stops.length - 1;
  let distance: number;
  let stopCount: number;
  if (ahead) {
    distance = segmentDistance(stops, here, target);
    stopCount = Math.abs(target - here);
  } else {
    // Target needs the reverse direction: run to the terminal, then back.
    const terminal = elev.dir === 1 ? top : 0;
    distance = segmentDistance(stops, here, terminal) + segmentDistance(stops, terminal, target);
    stopCount = Math.abs(terminal - here) + Math.abs(target - terminal);
  }

  return Math.max(0, distance * unit + stopCount * cfg.dwellTime);
}

/** Sum of |adjacent stop| distances traversed between stop indices a and b. */
function segmentDistance(stops: FloorId[], a: number, b: number): number {
  let d = 0;
  if (a < b) {
    for (let i = a; i < b; i += 1) d += Math.abs(stops[i + 1] - stops[i]);
  } else if (a > b) {
    for (let i = a; i > b; i -= 1) d += Math.abs(stops[i - 1] - stops[i]);
  }
  return d;
}

/**
 * Admissible A* heuristic: vertical distance to the nearest goal floor divided by
 * the building max speed (never the actual car speed, which is <= maxSpeed).
 */
export function heuristic(node: PNode, goals: ReadonlySet<FloorId>, cfg: SimConfig): number {
  if (goals.size === 0) return 0;
  let best = Infinity;
  for (const g of goals) {
    const d = Math.abs(g - node.floor);
    if (d < best) best = d;
  }
  const denom = cfg.maxSpeed > 0 ? cfg.maxSpeed : 1;
  return (best * cfg.floorTravelBase) / denom;
}

interface Edge {
  to: PNode;
  w: number;
}

/** Board edges: floor F -> elev E@F for every elevator stopping at F. */
function floorEdges(
  world: World,
  passenger: Passenger,
  cfg: SimConfig,
  floor: FloorId,
  mode: RouteMode,
): Edge[] {
  const out: Edge[] = [];
  for (const e of world.elevators) {
    if (!e.stops.includes(floor)) continue;
    const w =
      mode === 'bfs'
        ? BFS_BOARD
        : estWait(world, e, floor, cfg) + (floor === passenger.atFloor ? 0 : cfg.transferPenalty);
    out.push({ to: { kind: 'elev', floor, elev: e.id }, w });
  }
  return out;
}

/** From riding E@F: alight to floor F, or ride to an adjacent stop. */
function elevEdges(world: World, cfg: SimConfig, node: PNode & { kind: 'elev' }, mode: RouteMode): Edge[] {
  const out: Edge[] = [];
  const e = getElevator(world, node.elev);
  if (e === undefined) return out;

  out.push({ to: { kind: 'floor', floor: node.floor }, w: mode === 'bfs' ? 0 : cfg.alightTime });

  const idx = e.stops.indexOf(node.floor);
  if (idx < 0) return out;
  for (const adj of [idx - 1, idx + 1]) {
    if (adj < 0 || adj >= e.stops.length) continue;
    const next = e.stops[adj];
    const w =
      mode === 'bfs'
        ? 1
        : (cfg.floorTravelBase * Math.abs(next - node.floor)) / speedOf(e) + cfg.dwellTime;
    out.push({ to: { kind: 'elev', floor: next, elev: e.id }, w });
  }
  return out;
}

interface OpenItem {
  node: PNode;
  key: string;
  priority: number;
}

/** Simple priority queue: the graph is tiny, so a linear min-scan is plenty. */
function popMin(open: OpenItem[]): OpenItem | undefined {
  if (open.length === 0) return undefined;
  let best = 0;
  for (let i = 1; i < open.length; i += 1) {
    if (open[i].priority < open[best].priority) best = i;
  }
  const item = open[best];
  const last = open.pop();
  if (last !== undefined && best < open.length) open[best] = last;
  return item;
}

function reconstruct(
  world: World,
  came: Map<string, PNode>,
  nodeOf: Map<string, PNode>,
  goalKey: string,
): Leg[] {
  const path: PNode[] = [];
  let key: string | undefined = goalKey;
  while (key !== undefined) {
    const node = nodeOf.get(key);
    if (node === undefined) break;
    path.push(node);
    const parent = came.get(key);
    key = parent === undefined ? undefined : nodeKey(parent);
  }
  path.reverse();
  return collapse(world, path);
}

/** Collapse a node path into maximal single-elevator legs. */
function collapse(world: World, path: PNode[]): Leg[] {
  const legs: Leg[] = [];
  let i = 0;
  while (i < path.length) {
    const cur = path[i];
    const next = path[i + 1];
    if (cur.kind === 'floor' && next !== undefined && next.kind === 'elev') {
      const elevId = next.elev;
      let j = i + 1;
      while (j < path.length) {
        const at = path[j];
        if (at.kind !== 'elev' || at.elev !== elevId) break;
        j += 1;
      }
      const after = path[j];
      if (after !== undefined && after.kind === 'floor') {
        const e = getElevator(world, elevId);
        const boardFloor = cur.floor;
        const alightFloor = after.floor;
        const bi = e === undefined ? -1 : e.stops.indexOf(boardFloor);
        const ai = e === undefined ? -1 : e.stops.indexOf(alightFloor);
        legs.push({ elevator: elevId, boardFloor, alightFloor, rideDir: ai >= bi ? 1 : -1 });
        i = j;
        continue;
      }
    }
    i += 1;
  }
  return legs;
}

function search(world: World, passenger: Passenger, cfg: SimConfig, mode: RouteMode): Leg[] | null {
  const goals = new Set<FloorId>(floorsMatching(world, passenger.destZone).map((f) => f.id));
  if (goals.has(passenger.atFloor)) return [];
  if (goals.size === 0) return null;

  const start: PNode = { kind: 'floor', floor: passenger.atFloor };
  const startKey = nodeKey(start);
  const gScore = new Map<string, number>();
  const came = new Map<string, PNode>();
  const nodeOf = new Map<string, PNode>();
  const settled = new Set<string>();
  const open: OpenItem[] = [];

  gScore.set(startKey, 0);
  nodeOf.set(startKey, start);
  open.push({ node: start, key: startKey, priority: 0 });

  while (open.length > 0) {
    const cur = popMin(open);
    if (cur === undefined) break;
    if (settled.has(cur.key)) continue;
    settled.add(cur.key);

    const u = cur.node;
    if (u.kind === 'floor' && goals.has(u.floor)) {
      return reconstruct(world, came, nodeOf, cur.key);
    }

    const edges =
      u.kind === 'floor'
        ? floorEdges(world, passenger, cfg, u.floor, mode)
        : elevEdges(world, cfg, u, mode);
    const gu = gScore.get(cur.key) ?? Infinity;
    for (const edge of edges) {
      const toKey = nodeKey(edge.to);
      const ng = gu + edge.w;
      if (ng < (gScore.get(toKey) ?? Infinity)) {
        gScore.set(toKey, ng);
        came.set(toKey, u);
        nodeOf.set(toKey, edge.to);
        const priority = mode === 'astar' ? ng + heuristic(edge.to, goals, cfg) : ng;
        open.push({ node: edge.to, key: toKey, priority });
      }
    }
  }
  return null;
}

export function findPlanBFS(world: World, passenger: Passenger, cfg: SimConfig): Leg[] | null {
  return search(world, passenger, cfg, 'bfs');
}

export function findPlanAStar(world: World, passenger: Passenger, cfg: SimConfig): Leg[] | null {
  return search(world, passenger, cfg, 'astar');
}

export function findPlan(world: World, passenger: Passenger, cfg: SimConfig): Leg[] | null {
  return cfg.routeMode === 'bfs'
    ? findPlanBFS(world, passenger, cfg)
    : findPlanAStar(world, passenger, cfg);
}
