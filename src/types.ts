// Frozen data contract for the simulation. Mirrors docs/05-data-model.md
// plus additive day-cycle fields. Types only — no runtime code.

export type Tick = number;
export type FloorId = number;
export type ElevatorId = number;
export type PassengerId = number;

export type Zone = 'office' | 'residential' | 'hospital' | 'retail' | 'lobby' | 'special';

export type SpecialFloor = 'lobby' | 'skyLobby' | 'restaurant' | 'parking' | 'skybar' | 'er';

export interface Vec {
  x: number;
  y: number;
}

export interface Floor {
  id: FloorId;
  name: string;
  zone: Zone;
  special?: SpecialFloor;
  /** Passenger ids currently waiting on this floor. */
  waiting: PassengerId[];
  /** Congestion 0..1 (waiting / capacity). */
  pressure: number;
  /** Waiting count that maps to a full pressure bar. */
  capacity: number;
}

export type Policy = 'SCAN' | 'ZONE' | 'UP_PEAK' | 'DOWN_PEAK' | 'ALL_CALL';
export type ElevatorState = 'IDLE' | 'MOVING' | 'DWELL';

export interface Elevator {
  id: ElevatorId;
  color: string;
  /** Ordered stop list (non-consecutive = express). */
  stops: FloorId[];
  capacity: number;
  /** Floors per second. */
  speed: number;
  load: PassengerId[];
  policy: Policy;

  pos: number;
  posPrev: number;
  /** Signed vertical velocity in floors/second (accelerates toward / brakes before stops). */
  vel: number;
  dir: 1 | -1 | 0;
  state: ElevatorState;
  targetStopIndex: number;
  dwellUntilTick: Tick;
  idleFloor: FloorId;
}

export type PassengerState = 'WAIT' | 'RIDE' | 'TRANSFER' | 'DONE';

export interface Leg {
  elevator: ElevatorId;
  boardFloor: FloorId;
  alightFloor: FloorId;
  rideDir: 1 | -1;
}

export interface Passenger {
  id: PassengerId;
  from: FloorId;
  destZone: Zone;
  dir: 1 | -1;
  /** 1..4 people carried as one unit. */
  group: number;
  /** Remaining patience in ticks. */
  patience: number;
  state: PassengerState;
  atFloor: FloorId;
  onElev?: ElevatorId;
  plan: Leg[];
  legIndex: number;
}

export type Phase = 'morning' | 'midday' | 'evening' | 'night';

export interface GameStats {
  delivered: number;
  totalWaitTicks: number;
  maxWaitTicks: number;
  transfers: number;
  /** Rough proxy: total floors travelled by all cars. */
  energy: number;
}

export interface UpgradeOffer {
  kind: 'addElevator' | 'addCapacity';
  label: string;
}

export interface World {
  tick: Tick;
  seed: number;
  day: number;
  phase: Phase;
  dayEnded: boolean;
  floors: Floor[];
  elevators: Elevator[];
  passengers: Map<PassengerId, Passenger>;
  nextPassengerId: PassengerId;
  stats: GameStats;
  overPressureTicks: Map<FloorId, Tick>;
  gameOver: { floor: FloorId } | null;
  pendingUpgrade: UpgradeOffer[] | null;
}

/** Pathfinding graph node: a floor, or a floor while riding a specific elevator. */
export type PNode =
  | { kind: 'floor'; floor: FloorId }
  | { kind: 'elev'; floor: FloorId; elev: ElevatorId };

export interface ElevatorSpec {
  color: string;
  stops: FloorId[];
  capacity: number;
  speed: number;
  policy: Policy;
  idleFloor: FloorId;
}

export type RouteMode = 'bfs' | 'astar';

export interface SimConfig {
  simHz: number;
  /** Seconds per floor before dividing by speed. */
  floorTravelBase: number;
  /** Acceleration in floors/second² (spin-up and braking). */
  accel: number;
  /** Base door-open time per stop (seconds); grows with people served. */
  dwellTime: number;
  /** Extra door time per person that boards or alights (seconds). */
  boardTimePerPerson: number;
  transferPenalty: number;
  backtrackPenalty: number;
  alightTime: number;
  /** Initial patience in seconds. */
  patience: number;
  pressureThresholdTicks: number;
  transferThreshold: number;
  maxSpeed: number;
  dayLengthTicks: number;
  /** Fractional cut points [morning|midday, midday|evening, evening|night]. */
  phaseCuts: [number, number, number];
  passengerCap: number;
  routeMode: RouteMode;
}

export type Command =
  | { t: 'setStops'; tick: Tick; elev: ElevatorId; stops: FloorId[] }
  | { t: 'setPolicy'; tick: Tick; elev: ElevatorId; policy: Policy }
  | { t: 'addElevator'; tick: Tick; spec: ElevatorSpec }
  | { t: 'pause'; tick: Tick; paused: boolean }
  | { t: 'chooseUpgrade'; tick: Tick; kind: 'addElevator' | 'addCapacity' };

export type SimEvent =
  | { t: 'arrive'; elev: ElevatorId; floor: FloorId }
  | { t: 'deliver'; passenger: PassengerId }
  | { t: 'floorAtRisk'; floor: FloorId }
  | { t: 'gameOver'; floor: FloorId };
