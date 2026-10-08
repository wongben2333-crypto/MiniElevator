import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { stepMovement } from '../src/systems/movement';
import type { Leg } from '../src/types';
import { elevator, floor, passenger, world } from './fixtures';

const cfg = DEFAULT_CONFIG;

const leg = (elevatorId: number, board: number, alight: number, dir: 1 | -1): Leg => ({
  elevator: elevatorId,
  boardFloor: board,
  alightFloor: alight,
  rideDir: dir,
});

describe('stepMovement — MOVING', () => {
  it('accelerates from rest toward the target', () => {
    const e = elevator(1, [1, 2, 3], { pos: 1, dir: 1, state: 'MOVING', targetStopIndex: 1 });
    const w = world({ elevators: [e] });
    const maxStep = e.speed / cfg.simHz;

    stepMovement(w, cfg);

    expect(e.vel).toBeGreaterThan(0);
    expect(e.vel).toBeLessThan(e.speed);
    expect(e.pos - 1).toBeGreaterThan(0);
    expect(e.pos - 1).toBeLessThan(maxStep);
  });

  it('reaches cruise speed over several ticks when the target is far', () => {
    const e = elevator(1, [1, 10], { pos: 1, dir: 1, state: 'MOVING', targetStopIndex: 1 });
    const w = world({ elevators: [e] });
    for (let i = 0; i < 120; i += 1) stepMovement(w, cfg);
    expect(e.vel).toBeGreaterThan(e.speed * 0.99);
    expect(e.vel).toBeLessThanOrEqual(e.speed + 1e-9);
  });

  it('cruises at max speed and updates posPrev / energy each tick', () => {
    const e = elevator(1, [1, 10], { pos: 1, dir: 1, state: 'MOVING', targetStopIndex: 1 });
    e.vel = e.speed;
    const w = world({ elevators: [e] });
    const perTick = e.speed / cfg.simHz;

    stepMovement(w, cfg);

    expect(e.pos).toBeCloseTo(1 + perTick, 12);
    expect(e.posPrev).toBe(1);

    stepMovement(w, cfg);

    expect(e.pos).toBeCloseTo(1 + 2 * perTick, 12);
    expect(e.posPrev).toBeCloseTo(1 + perTick, 12);
    expect(w.stats.energy).toBeCloseTo(2 * perTick, 12);
  });

  it('does not advance world.tick (the central pipeline owns the clock)', () => {
    const e = elevator(1, [1, 2], { pos: 1, dir: 1, state: 'MOVING', targetStopIndex: 1 });
    const w = world({ tick: 42, elevators: [e] });

    stepMovement(w, cfg);

    expect(w.tick).toBe(42);
  });
});

describe('stepMovement — arrival', () => {
  it('snaps exactly onto the target and enters DWELL with tick + round(dwellTime*simHz)', () => {
    const e = elevator(1, [1, 2, 3], { pos: 1.999, dir: 1, state: 'MOVING', targetStopIndex: 1 });
    const w = world({ tick: 7, elevators: [e] });

    stepMovement(w, cfg);

    expect(e.pos).toBe(2);
    expect(e.posPrev).toBe(1.999);
    expect(e.state).toBe('DWELL');
    expect(e.dwellUntilTick).toBe(7 + Math.round(cfg.dwellTime * cfg.simHz));
  });
});

describe('stepMovement — DWELL completion', () => {
  it('re-selects a waiting call and starts MOVING', () => {
    const waiting = passenger(1, 3, 'office', { plan: [leg(1, 3, 5, 1)] });
    const e = elevator(1, [1, 2, 3, 5], {
      pos: 2,
      dir: 1,
      state: 'DWELL',
      targetStopIndex: 1,
      dwellUntilTick: 3,
    });
    const w = world({
      tick: 3,
      floors: [floor(1, 'lobby'), floor(2, 'office'), floor(3, 'office', { waiting: [1] })],
      elevators: [e],
      passengers: new Map([[1, waiting]]),
    });

    stepMovement(w, cfg);

    expect(e.state).toBe('MOVING');
    expect(e.targetStopIndex).toBe(2);
    expect(e.dir).toBe(1);
  });

  it('falls back to IDLE when no call exists', () => {
    const e = elevator(1, [1, 2, 3], {
      pos: 2,
      dir: 1,
      state: 'DWELL',
      targetStopIndex: 1,
      dwellUntilTick: 3,
    });
    const w = world({ tick: 3, elevators: [e] });

    stepMovement(w, cfg);

    expect(e.state).toBe('IDLE');
  });

  it('keeps dwelling until the deadline arrives', () => {
    const e = elevator(1, [1, 2, 3], {
      pos: 2,
      dir: 1,
      state: 'DWELL',
      targetStopIndex: 1,
      dwellUntilTick: 10,
    });
    const w = world({ tick: 9, elevators: [e] });

    stepMovement(w, cfg);

    expect(e.state).toBe('DWELL');
  });
});

describe('stepMovement — leaving DWELL with a leftover same-floor call', () => {
  it('ignores the call on the current stop and targets the next stop ahead', () => {
    const waitingHere = passenger(1, 1, 'office', { plan: [leg(1, 1, 3, 1)] });
    const ahead = passenger(2, 2, 'office', { plan: [leg(1, 2, 3, 1)] });
    const e = elevator(1, [1, 2, 3], {
      pos: 1,
      dir: 1,
      state: 'DWELL',
      targetStopIndex: 0,
      dwellUntilTick: 0,
    });
    const w = world({
      tick: 1,
      floors: [
        floor(1, 'lobby', { waiting: [1] }),
        floor(2, 'office', { waiting: [2] }),
        floor(3, 'office'),
      ],
      elevators: [e],
      passengers: new Map([
        [1, waitingHere],
        [2, ahead],
      ]),
    });

    stepMovement(w, cfg);

    expect(e.state).toBe('MOVING');
    expect(e.targetStopIndex).toBe(1);
    expect(e.dir).toBe(1);
  });

  it('advances on the following tick instead of stalling at the same floor', () => {
    const waitingHere = passenger(1, 1, 'office', { plan: [leg(1, 1, 3, 1)] });
    const ahead = passenger(2, 2, 'office', { plan: [leg(1, 2, 3, 1)] });
    const e = elevator(1, [1, 2, 3], {
      pos: 1,
      dir: 1,
      state: 'DWELL',
      targetStopIndex: 0,
      dwellUntilTick: 0,
    });
    const w = world({
      tick: 1,
      floors: [
        floor(1, 'lobby', { waiting: [1] }),
        floor(2, 'office', { waiting: [2] }),
        floor(3, 'office'),
      ],
      elevators: [e],
      passengers: new Map([
        [1, waitingHere],
        [2, ahead],
      ]),
    });

    stepMovement(w, cfg); // leave DWELL toward floor 2
    stepMovement(w, cfg); // move one step

    expect(e.state).toBe('MOVING');
    expect(e.pos).toBeGreaterThan(1);
  });
});

describe('stepMovement — long-run stability', () => {
  it('never produces a NaN position after 10_000 ticks with calls pending', () => {
    const low = elevator(1, [1, 2, 3, 4, 5], { pos: 1, dir: 1, state: 'IDLE', targetStopIndex: 0 });
    const high = elevator(2, [1, 5, 6, 7], { pos: 5, dir: -1, state: 'IDLE', targetStopIndex: 0 });
    const w = world({
      floors: [
        floor(1, 'lobby'),
        floor(2, 'office', { waiting: [1] }),
        floor(3, 'office'),
        floor(4, 'office', { waiting: [2] }),
        floor(5, 'office'),
        floor(6, 'office', { waiting: [3] }),
        floor(7, 'office', { waiting: [4] }),
      ],
      elevators: [low, high],
      passengers: new Map([
        [1, passenger(1, 2, 'office', { plan: [leg(1, 2, 5, 1)] })],
        [2, passenger(2, 4, 'office', { plan: [leg(1, 4, 5, 1)] })],
        [3, passenger(3, 6, 'office', { plan: [leg(2, 6, 1, -1)] })],
        [4, passenger(4, 7, 'office', { plan: [leg(2, 7, 1, -1)] })],
      ]),
    });

    for (let i = 0; i < 10_000; i += 1) {
      w.tick += 1; // central pipeline increments before systems
      stepMovement(w, cfg);
    }

    for (const e of w.elevators) {
      expect(Number.isNaN(e.pos)).toBe(false);
      expect(Number.isFinite(e.pos)).toBe(true);
      expect(Number.isNaN(e.posPrev)).toBe(false);
      expect(Number.isFinite(e.posPrev)).toBe(true);
    }
  });
});
