// Deterministic record / replay: a run is fully described by its seed plus the
// ordered stream of player commands. Pure logic — no DOM, no wall-clock. See
// docs/02 §5 and docs/05 §10.

import { DEFAULT_CONFIG } from './config';
import { applyCommand, createWorld, makeRng, step } from './sim';
import type { Command, SimConfig, World } from './types';

export const REPLAY_VERSION = 1;

export interface ReplayLog {
  version: number;
  seed: number;
  /** Commands in application order; each carries the tick it was applied at. */
  commands: Command[];
}

export function createReplayLog(seed: number): ReplayLog {
  return { version: REPLAY_VERSION, seed, commands: [] };
}

/** Append a command to the log (insertion order preserved). */
export function recordCommand(log: ReplayLog, cmd: Command): void {
  log.commands.push(cmd);
}

export function serializeReplay(log: ReplayLog): string {
  return JSON.stringify(log);
}

function isCommand(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const t = (value as { t?: unknown }).t;
  return (
    t === 'setStops' ||
    t === 'setPolicy' ||
    t === 'addElevator' ||
    t === 'pause' ||
    t === 'chooseUpgrade'
  );
}

/** Parse and validate a serialized log; throws on malformed input. */
export function parseReplay(text: string): ReplayLog {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== 'object' || raw === null) throw new Error('replay: not an object');
  const obj = raw as { version?: unknown; seed?: unknown; commands?: unknown };
  if (obj.version !== REPLAY_VERSION) {
    throw new Error(`replay: unsupported version ${String(obj.version)}`);
  }
  if (typeof obj.seed !== 'number' || !Number.isFinite(obj.seed)) {
    throw new Error('replay: bad seed');
  }
  if (!Array.isArray(obj.commands)) throw new Error('replay: commands must be an array');
  for (const cmd of obj.commands) {
    if (!isCommand(cmd)) throw new Error('replay: invalid command');
  }
  return { version: REPLAY_VERSION, seed: obj.seed, commands: obj.commands as Command[] };
}

/**
 * Rebuild a run from a log. Commands are applied at (or before) their recorded
 * tick, before the next step — matching how the live loop timestamps them — so
 * same seed + same stream reproduces an identical world.
 *
 * Stops early on game over, or if the log is missing the upgrade command needed
 * to leave a paused day boundary.
 */
export function runReplay(log: ReplayLog, cfg: SimConfig = DEFAULT_CONFIG, maxTicks = 1_000_000): World {
  const world = createWorld(log.seed, cfg);
  const rng = makeRng(world);
  const commands = [...log.commands].sort((a, b) => a.tick - b.tick);
  let cursor = 0;

  const applyDue = (): void => {
    while (cursor < commands.length && commands[cursor].tick <= world.tick) {
      applyCommand(world, commands[cursor], cfg);
      cursor += 1;
    }
  };

  applyDue();
  while (world.gameOver === null && world.tick < maxTicks) {
    if (world.pendingUpgrade !== null) {
      const before = cursor;
      applyDue();
      if (cursor === before) break; // incomplete log: nothing chooses the upgrade
      continue;
    }
    step(world, cfg, rng);
    applyDue();
  }
  return world;
}
