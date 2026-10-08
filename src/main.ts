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
      setSpeed: (speed: 1 | 2) => void;
      getSpeed: () => number;
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
/** Base number of fixed steps we will simulate to catch up after a laggy frame. */
const CATCHUP_BASE = 5;
/** Hard cap on a single frame's wall-clock delta (seconds). */
const MAX_FRAME = 0.25;

const seedParam = new URLSearchParams(window.location.search).get('seed');
const seed = seedParam !== null && seedParam !== '' ? Number(seedParam) : Date.now() & 0xffff;

const world = createWorld(seed, DEFAULT_CONFIG);
const rng = makeRng(world);
let paused = false;
let speed: 1 | 2 = 1;
let selected = -1;

/**
 * Match the drawing buffer to the CSS size × devicePixelRatio, then scale the
 * context so every draw call keeps working in logical (CSS) pixels. Re-applied
 * on every resize because resizing the backing store resets the transform.
 */
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW <= 0 || cssH <= 0) return;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
if (typeof ResizeObserver !== 'undefined') {
  // Catches the dynamic-viewport (URL bar) and layout-driven size changes.
  new ResizeObserver(resize).observe(canvas);
}
resize();

attachInput(canvas, world, {
  onCommand: (cmd: Command) => applyCommand(world, cmd, DEFAULT_CONFIG),
  getPaused: () => paused,
  setPaused: (p) => {
    paused = p;
  },
  getSpeed: () => speed,
  setSpeed: (s) => {
    speed = s;
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
  setSpeed: (s) => {
    speed = s;
  },
  getSpeed: () => speed,
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

  if (paused) {
    // Freeze the accumulator so resuming does not fast-forward a burst.
    acc = 0;
  } else {
    acc += dt * speed;
  }

  // At 2× a slow frame can bank more time than we will ever consume; cap the
  // backlog so the loop cannot death-spiral into unbounded catch-up.
  const maxCatchup = CATCHUP_BASE * speed;
  const maxAcc = STEP * maxCatchup;
  if (acc > maxAcc) acc = maxAcc;

  let steps = 0;
  while (acc >= STEP && steps < maxCatchup) {
    step(world, DEFAULT_CONFIG, rng);
    acc -= STEP;
    steps += 1;
  }

  draw(ctx, world, paused ? 0 : acc / STEP, selected);
  drawHud(ctx, world, { paused, speed });
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
