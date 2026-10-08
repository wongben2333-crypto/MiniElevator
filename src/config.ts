// Data-driven balance config. Change numbers here, not logic.

import type {
  ElevatorSpec,
  Floor,
  FloorId,
  Phase,
  SimConfig,
  SpecialFloor,
  Zone,
} from './types';

export const DEFAULT_CONFIG: SimConfig = {
  simHz: 60,
  floorTravelBase: 0.5,
  accel: 4,
  dwellTime: 1.2,
  boardTimePerPerson: 0.4,
  transferPenalty: 10,
  backtrackPenalty: 6,
  alightTime: 0,
  patience: 60,
  pressureThresholdTicks: 600,
  transferThreshold: 3,
  maxSpeed: 2,
  dayLengthTicks: 7200, // 120s at 60Hz
  phaseCuts: [0.35, 0.6, 0.85],
  passengerCap: 300,
  routeMode: 'astar',
};

export interface BuildingFloorSpec {
  id: FloorId;
  name: string;
  zone: Zone;
  special?: SpecialFloor;
  capacity: number;
}

export const BUILDING: BuildingFloorSpec[] = [
  { id: -1, name: 'B1 停车场', zone: 'special', special: 'parking', capacity: 12 },
  { id: 1, name: '1F 大堂', zone: 'lobby', special: 'lobby', capacity: 20 },
  { id: 2, name: '2F', zone: 'office', capacity: 10 },
  { id: 3, name: '3F', zone: 'office', capacity: 10 },
  { id: 4, name: '4F', zone: 'office', capacity: 10 },
  { id: 5, name: '5F 空中大堂', zone: 'office', special: 'skyLobby', capacity: 14 },
  { id: 6, name: '6F', zone: 'office', capacity: 10 },
  { id: 7, name: '7F', zone: 'office', capacity: 10 },
  { id: 8, name: '8F', zone: 'office', capacity: 10 },
  { id: 9, name: '9F 餐厅', zone: 'retail', special: 'restaurant', capacity: 8 },
  { id: 10, name: '10F 屋顶酒吧', zone: 'special', special: 'skybar', capacity: 8 },
];

export const LOBBY_FLOOR: FloorId = 1;

/** The building grows by one floor per day, up to this floor id. */
export const MAX_FLOOR_ID: FloorId = 20;

/** Maximum number of elevators the building can run (day-end upgrades stop adding). */
export const MAX_ELEVATORS = 5;

/**
 * Spec for the floor added when the building grows (tenants move in). The zone is
 * a deterministic function of the floor id; returns null once `MAX_FLOOR_ID` is hit.
 * New floors are NOT auto-added to any elevator — the player connects them.
 */
export function growthFloor(id: FloorId): BuildingFloorSpec | null {
  if (id > MAX_FLOOR_ID) return null;
  const zone: Zone = id % 5 === 0 ? 'retail' : id % 3 === 0 ? 'residential' : 'office';
  const capacity = zone === 'retail' ? 8 : zone === 'residential' ? 12 : 10;
  return { id, name: `${id}F`, zone, capacity };
}

const LOW_COLOR = '#e4572e';
const HIGH_COLOR = '#2e86e4';
export const ELEVATOR_PALETTE = [
  '#e4572e',
  '#2e86e4',
  '#38b764',
  '#b855e0',
  '#e0b02e',
  '#29c7c7',
  '#e04b7f',
  '#7f8fa6',
];

export const ELEVATOR_SPECS: ElevatorSpec[] = [
  {
    color: LOW_COLOR,
    stops: [-1, 1, 2, 3, 4, 5],
    capacity: 10,
    speed: 1.6,
    policy: 'SCAN',
    idleFloor: LOBBY_FLOOR,
  },
  {
    color: HIGH_COLOR,
    stops: [1, 5, 6, 7, 8, 9, 10],
    capacity: 10,
    speed: 1.6,
    policy: 'SCAN',
    idleFloor: LOBBY_FLOOR,
  },
];

export const PHASE_ORDER: Phase[] = ['morning', 'midday', 'evening', 'night'];

/** Passengers spawned per second during each phase. */
export const SPAWN_PER_SECOND: Record<Phase, number> = {
  morning: 0.3,
  midday: 0.15,
  evening: 0.3,
  night: 0.06,
};

/** Relative spawn pull per zone, keyed by `Floor.zone`. */
const ZONE_SPAWN_WEIGHTS: Record<Zone, { origin: number; dest: number }> = {
  office: { origin: 1.0, dest: 1.0 },
  residential: { origin: 1.1, dest: 1.1 },
  retail: { origin: 1.1, dest: 1.4 },
  lobby: { origin: 2.0, dest: 2.0 },
  special: { origin: 1.5, dest: 1.8 },
  hospital: { origin: 1.5, dest: 1.8 },
};

/** A floor with `special` set uses this table instead of its zone base. */
const SPECIAL_SPAWN_WEIGHTS: Record<SpecialFloor, { origin: number; dest: number }> = {
  skyLobby: { origin: 2.2, dest: 2.2 },
  restaurant: { origin: 1.8, dest: 2.2 },
  skybar: { origin: 1.8, dest: 2.2 },
  parking: { origin: 1.3, dest: 1.3 },
  lobby: { origin: 2.0, dest: 2.0 },
  er: { origin: 2.2, dest: 2.2 },
};

function spawnWeights(floor: Floor): { origin: number; dest: number } {
  return floor.special !== undefined
    ? SPECIAL_SPAWN_WEIGHTS[floor.special]
    : ZONE_SPAWN_WEIGHTS[floor.zone];
}

/** Relative chance a floor is chosen as a passenger ORIGIN (departure). */
export function spawnOriginWeight(floor: Floor): number {
  return spawnWeights(floor).origin;
}

/** Relative chance a floor is chosen as a passenger DESTINATION (arrival). */
export function spawnDestWeight(floor: Floor): number {
  return spawnWeights(floor).dest;
}

/**
 * Reference targets that map raw run stats to a 0..100 quality score (see
 * `score.ts`). Calibrated so a solid 3-day shipped run scores ~70.
 */
export const SCORE_TARGETS = {
  /** Delivered passengers for full throughput credit. */
  delivered: 200,
  /** Tolerable average wait per delivered passenger (seconds). */
  waitSeconds: 12,
  /** Tolerable floors travelled per delivered passenger. */
  energyPerDelivery: 5.5,
  /** Transfers per delivered passenger considered harmless. */
  transferRate: 0.15,
} as const;

export const UPGRADE_CHOICES: ReadonlyArray<{ kind: 'addElevator' | 'addCapacity'; label: string }> = [
  { kind: 'addElevator', label: '新增电梯' },
  { kind: 'addCapacity', label: '容量 +4' },
];

export function secToTicks(sec: number, hz: number = DEFAULT_CONFIG.simHz): number {
  return Math.round(sec * hz);
}
