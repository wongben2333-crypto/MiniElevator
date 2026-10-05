// Browser boot: fixed-timestep loop wiring the pure sim to render + input + hud.
// This is the only place that touches timing, the DOM, and requestAnimationFrame.

import { DEFAULT_CONFIG } from './config';
import { drawHud } from './hud';
import { attachInput } from './input';
import { draw } from './render';
import { applyCommand, createWorld, makeRng, step } from './sim';
import type { Command, World } from './types';

declare global {
  interface Window {
    /** Test/QA bridge. Not used by gameplay. */
    __verticalRush?: {
      world: World;
      pause: (paused: boolean) => void;
      step: (ticks: number) => void;
    };
  }
}

function requireCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const el = document.querySelector<HTMLCanvasElement>('#game');
  if (el === null) throw new Error('missing #game canvas');
  const context = el.getContext('2d');
  if (context === null) throw new Error('missing 2d context');
  return { canvas: el, ctx: context };
}

const { canvas, ctx } = requireCanvas();

const SIM_HZ = DEFAULT_CONFIG.simHz;
const STEP = 1 / SIM_HZ;
const MAX_CATCHUP = 5;
const MAX_FRAME = 0.25;

const seedParam = new URLSearchParams(window.location.search).get('seed');
const seed = seedParam !== null && seedParam !== '' ? Number(seedParam) : Date.now() & 0xffff;

const world = createWorld(seed, DEFAULT_CONFIG);
const rng = makeRng(world);
let paused = false;
let selected = -1;

function resize(): void {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}

window.addEventListener('resize', resize);
resize();

attachInput(canvas, world, {
  onCommand: (cmd: Command) => applyCommand(world, cmd, DEFAULT_CONFIG),
  getPaused: () => paused,
  setPaused: (p) => {
    paused = p;
  },
  getSelected: () => selected,
  setSelected: (id) => {
    selected = id;
  },
});

window.__verticalRush = {
  world,
  pause: (p) => {
    paused = p;
  },
  step: (ticks) => {
    for (let i = 0; i < ticks; i += 1) step(world, DEFAULT_CONFIG, rng);
  },
};

let acc = 0;
let prev = performance.now();

function frame(now: number): void {
  let dt = (now - prev) / 1000;
  prev = now;
  if (dt > MAX_FRAME) dt = MAX_FRAME;
  acc += dt;

  let steps = 0;
  while (acc >= STEP && steps < MAX_CATCHUP) {
    if (!paused) step(world, DEFAULT_CONFIG, rng);
    acc -= STEP;
    steps += 1;
  }

  draw(ctx, world, acc / STEP, selected);
  drawHud(ctx, world, paused);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
