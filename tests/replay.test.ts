import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import {
  createReplayLog,
  parseReplay,
  recordCommand,
  runReplay,
  serializeReplay,
} from '../src/replay';
import { mulberry32 } from '../src/rng';
import { applyCommand, createWorld, step } from '../src/sim';
import type { Command, SimConfig, World } from '../src/types';

// A shorter day keeps the determinism test fast while still crossing boundaries.
const cfg: SimConfig = { ...DEFAULT_CONFIG, dayLengthTicks: 1200 };

function hash(w: World): string {
  return JSON.stringify({
    tick: w.tick,
    day: w.day,
    delivered: w.stats.delivered,
    energy: Math.round(w.stats.energy),
    transfers: w.stats.transfers,
    pax: [...w.passengers.values()]
      .map((p) => [p.id, p.state, p.atFloor, p.legIndex])
      .sort((a, b) => (a[0] as number) - (b[0] as number)),
    load: w.elevators.map((e) => [...e.load].sort((a, b) => a - b)),
    stops: w.elevators.map((e) => [...e.stops]),
    pos: w.elevators.map((e) => Math.round(e.pos * 1000)),
  });
}

describe('replay serialize / parse', () => {
  it('round-trips a log unchanged', () => {
    const log = createReplayLog(7);
    recordCommand(log, { t: 'setStops', tick: 3, elev: 0, stops: [1, 2, 3] });
    recordCommand(log, { t: 'chooseUpgrade', tick: 1200, kind: 'addCapacity' });
    expect(parseReplay(serializeReplay(log))).toEqual(log);
  });

  it('rejects malformed logs', () => {
    expect(() => parseReplay('not json')).toThrow();
    expect(() => parseReplay(JSON.stringify({ version: 999, seed: 1, commands: [] }))).toThrow();
    expect(() => parseReplay(JSON.stringify({ version: 1, seed: 1, commands: [{ t: 'nope' }] }))).toThrow();
  });
});

describe('runReplay', () => {
  it('reproduces the exact world from seed + command stream', () => {
    const log = createReplayLog(3);
    const live = createWorld(3, cfg);
    const rng = mulberry32(live.seed);
    const maxTicks = cfg.dayLengthTicks * 2 + 5;

    const record = (cmd: Command): void => {
      recordCommand(log, cmd);
      applyCommand(live, cmd, cfg);
    };

    while (live.gameOver === null && live.tick < maxTicks) {
      if (live.pendingUpgrade !== null) {
        record({ t: 'chooseUpgrade', tick: live.tick, kind: 'addElevator' });
        continue;
      }
      step(live, cfg, rng);
      if (live.tick === 500) record({ t: 'setStops', tick: live.tick, elev: 0, stops: [-1, 1, 2, 3, 4, 5, 6] });
      if (live.tick === 700) record({ t: 'setPolicy', tick: live.tick, elev: 1, policy: 'ALL_CALL' });
    }

    const replayed = runReplay(log, cfg, maxTicks);
    expect(replayed.tick).toBe(live.tick);
    expect(hash(replayed)).toEqual(hash(live));
  });
});
