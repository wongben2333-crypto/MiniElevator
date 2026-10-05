import { describe, expect, it } from 'vitest';
import type { SimConfig } from '../src/types';
import { DEFAULT_CONFIG, UPGRADE_CHOICES } from '../src/config';
import { currentPhase, demandScale, stepDayCycle } from '../src/systems/daycycle';
import { world } from './fixtures';

/** Small, exact day so phase cuts land on integer ticks. */
function cfg(over: Partial<SimConfig> = {}): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    dayLengthTicks: 100,
    phaseCuts: [0.25, 0.5, 0.75],
    ...over,
  };
}

describe('currentPhase', () => {
  it('maps a tick fraction to the phase its cut range covers', () => {
    const c = cfg();
    // morning: [0, 0.25)
    expect(currentPhase(0, c)).toBe('morning');
    expect(currentPhase(24, c)).toBe('morning');
    // midday: [0.25, 0.5)
    expect(currentPhase(25, c)).toBe('midday');
    expect(currentPhase(49, c)).toBe('midday');
    // evening: [0.5, 0.75)
    expect(currentPhase(50, c)).toBe('evening');
    expect(currentPhase(74, c)).toBe('evening');
    // night: [0.75, 1)
    expect(currentPhase(75, c)).toBe('night');
    expect(currentPhase(99, c)).toBe('night');
    // wraps back to morning on the next day
    expect(currentPhase(100, c)).toBe('morning');
  });
});

describe('demandScale', () => {
  it('grows 15% per day from a base of 1', () => {
    expect(demandScale(1)).toBe(1);
    expect(demandScale(2)).toBe(1.15);
  });
});

describe('stepDayCycle', () => {
  it('writes the current phase onto the world', () => {
    const w = world({ tick: 60, phase: 'morning' });
    stepDayCycle(w, cfg());
    expect(w.phase).toBe('evening');
  });

  it('advances the day and offers an upgrade at a day boundary', () => {
    const w = world({ tick: 100, day: 1, dayEnded: false, pendingUpgrade: null });
    stepDayCycle(w, cfg());

    expect(w.day).toBe(2);
    expect(w.dayEnded).toBe(true);
    expect(w.pendingUpgrade).not.toBeNull();
    expect(w.pendingUpgrade).toEqual(UPGRADE_CHOICES.map((o) => ({ ...o })));
    // A fresh copy, never the shared config array.
    expect(w.pendingUpgrade).not.toBe(UPGRADE_CHOICES);
  });

  it('leaves dayEnded and pendingUpgrade untouched on a non-boundary tick', () => {
    const w = world({ tick: 42, day: 1, dayEnded: false, pendingUpgrade: null });
    stepDayCycle(w, cfg());

    expect(w.day).toBe(1);
    expect(w.dayEnded).toBe(false);
    expect(w.pendingUpgrade).toBeNull();
  });
});
