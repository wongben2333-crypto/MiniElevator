// Data-driven balance config. Change numbers here, not logic.

import type {
  ElevatorSpec,
  FloorId,
  Phase,
  SimConfig,
  SpecialFloor,
  Zone,
} from './types';

export const DEFAULT_CONFIG: SimConfig = {
  simHz: 60,
  floorTravelBase: 0.5,
  dwellTime: 2.5,
  transferPenalty: 10,
  backtrackPenalty: 6,
  alightTime: 0,
  patience: 60,
  pressureThresholdTicks: 300,
  transferThreshold: 3,
  maxSpeed: 2,
  dayLengthTicks: 10800, // 180s at 60Hz
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
  { id: -1, name: 'B1', zone: 'special', special: 'parking', capacity: 12 },
  { id: 1, name: '1F', zone: 'lobby', special: 'lobby', capacity: 20 },
  { id: 2, name: '2F', zone: 'office', capacity: 10 },
  { id: 3, name: '3F', zone: 'office', capacity: 10 },
  { id: 4, name: '4F', zone: 'office', capacity: 10 },
  { id: 5, name: '5F', zone: 'office', special: 'skyLobby', capacity: 14 },
  { id: 6, name: '6F', zone: 'office', capacity: 10 },
  { id: 7, name: '7F', zone: 'office', capacity: 10 },
  { id: 8, name: '8F', zone: 'office', capacity: 10 },
  { id: 9, name: '9F', zone: 'retail', special: 'restaurant', capacity: 8 },
  { id: 10, name: '10F', zone: 'special', special: 'skybar', capacity: 8 },
];

export const LOBBY_FLOOR: FloorId = 1;

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
    stops: [1, 2, 3, 4, 5],
    capacity: 8,
    speed: 1.5,
    policy: 'SCAN',
    idleFloor: LOBBY_FLOOR,
  },
  {
    color: HIGH_COLOR,
    stops: [1, 5, 6, 7, 8, 9, 10],
    capacity: 8,
    speed: 1.5,
    policy: 'SCAN',
    idleFloor: LOBBY_FLOOR,
  },
];

export const PHASE_ORDER: Phase[] = ['morning', 'midday', 'evening', 'night'];

/** Passengers spawned per second during each phase. */
export const SPAWN_PER_SECOND: Record<Phase, number> = {
  morning: 0.5,
  midday: 0.25,
  evening: 0.5,
  night: 0.1,
};

export const UPGRADE_CHOICES: ReadonlyArray<{ kind: 'addElevator' | 'addCapacity'; label: string }> = [
  { kind: 'addElevator', label: '新增电梯' },
  { kind: 'addCapacity', label: '容量 +4' },
];

export function secToTicks(sec: number, hz: number = DEFAULT_CONFIG.simHz): number {
  return Math.round(sec * hz);
}
