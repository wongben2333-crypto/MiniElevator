// Canvas 2D drawing layer for the building cross-section (dark, minimal,
// Mini-Metro-like). Deterministic only: no randomness, no clocks, no DOM
// lookups — everything derives from `world` and the pure view geometry.

import { LOBBY_FLOOR } from './config';
import type { World, Zone } from './types';
import { elevatorX, floorToY, plotBottom, plotTop, type ViewConfig } from './view';

/** Passenger square color by destination zone. */
const ZONE_COLOR: Record<Zone, string> = {
  office: '#2e86e4',
  lobby: '#e4572e',
  retail: '#e0b02e',
  special: '#b855e0',
  hospital: '#38b764',
  residential: '#7f8fa6',
};

const FONT = '12px system-ui';
const TEXT = '#e8edf2';
const MUTED = '#7f8fa6';
const BAR_MAX = 60;
const MAX_WAITING_DRAWN = 40;
/** Pressure bar ramp: green → amber → red. */
const GREEN = [0x38, 0xb7, 0x64] as const;
const AMBER = [0xe0, 0xb0, 0x2e] as const;
const RED = [0xe4, 0x57, 0x2e] as const;
/** Deterministic skyline on the left third: [xFrac, wFrac, hFrac of plot]. */
const SKYLINE: readonly (readonly [number, number, number])[] = [
  [0.01, 0.06, 0.45], [0.09, 0.05, 0.66], [0.16, 0.08, 0.34],
  [0.25, 0.06, 0.74], [0.33, 0.07, 0.5], [0.42, 0.05, 0.3],
  [0.49, 0.08, 0.6], [0.59, 0.06, 0.42], [0.67, 0.09, 0.7],
  [0.78, 0.05, 0.36], [0.85, 0.07, 0.55], [0.94, 0.05, 0.4],
];

/** Build the cross-section layout for the current building + canvas size. */
export function makeView(width: number, height: number, world: World): ViewConfig {
  let minFloor = 0;
  let maxFloor = 0;
  if (world.floors.length > 0) {
    minFloor = maxFloor = world.floors[0].id;
    for (const f of world.floors) {
      if (f.id < minFloor) minFloor = f.id;
      if (f.id > maxFloor) maxFloor = f.id;
    }
  }
  return {
    width,
    height,
    minFloor,
    maxFloor,
    marginTop: 70,
    marginBottom: 40,
    shaftFirstX: width * 0.55,
    shaftGapX: 46,
  };
}

/** Redraw the whole frame. `alpha` ∈ [0,1] interpolates elevator motion. */
export function draw(
  ctx: CanvasRenderingContext2D,
  world: World,
  alpha: number,
  selectedElevator: number = -1,
): void {
  const v = makeView(ctx.canvas.width, ctx.canvas.height, world);
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  ctx.font = FONT;
  drawBackground(ctx, v);
  drawFloorBands(ctx, v, world);
  drawPressureBars(ctx, v, world);
  drawWaiting(ctx, v, world);
  // Elevators: shaft line, stop markers, interpolated capsule, selection ring.
  const top = plotTop(v);
  const bottom = plotBottom(v);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of world.elevators) {
    const x = elevatorX(v, e.id);
    ctx.fillStyle = 'rgba(232,237,242,0.1)';
    ctx.fillRect(x - 1, top, 2, bottom - top);
    ctx.fillStyle = e.color;
    for (const s of e.stops) ctx.fillRect(x - 4, floorToY(v, s) - 1, 8, 2);
    const y = floorToY(v, e.posPrev + (e.pos - e.posPrev) * a);
    ctx.fillStyle = e.color;
    capsule(ctx, x, y);
    if (e.id === selectedElevator) {
      ctx.strokeStyle = TEXT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 15, 17, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = TEXT;
    ctx.fillText(String(e.load.length), x, y);
  }
  drawTransfers(ctx, v, world);
}

function mix(a: readonly number[], b: readonly number[], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function pressureColor(p: number): string {
  const q = p < 0 ? 0 : p > 1 ? 1 : p;
  return q < 0.5 ? mix(GREEN, AMBER, q * 2) : mix(AMBER, RED, q * 2 - 1);
}

function drawBackground(ctx: CanvasRenderingContext2D, v: ViewConfig): void {
  const g = ctx.createLinearGradient(0, 0, 0, v.height);
  g.addColorStop(0, '#161c25');
  g.addColorStop(1, '#0d1116');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.width, v.height);
  // Faint deterministic city silhouette in the left third.
  const third = v.width / 3;
  const base = plotBottom(v);
  const plotH = base - plotTop(v);
  ctx.fillStyle = 'rgba(127,143,166,0.12)';
  for (const [fx, fw, hf] of SKYLINE) {
    const bh = hf * plotH;
    ctx.fillRect(fx * third, base - bh, fw * third, bh);
  }
}

function drawFloorBands(ctx: CanvasRenderingContext2D, v: ViewConfig, world: World): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const f of world.floors) {
    const y = floorToY(v, f.id);
    const isLobby = f.special === 'lobby' || f.id === LOBBY_FLOOR;
    const isSky = f.special === 'skyLobby';
    const accent = isLobby || isSky;
    ctx.fillStyle = isLobby
      ? 'rgba(224,176,46,0.6)'
      : isSky
        ? 'rgba(46,134,228,0.55)'
        : 'rgba(232,237,242,0.12)';
    ctx.fillRect(12, y - (accent ? 1 : 0), v.width - 24, accent ? 2 : 1);
    ctx.fillStyle = accent ? TEXT : MUTED;
    ctx.fillText(f.name, 12, y - 9);
  }
}

function drawPressureBars(ctx: CanvasRenderingContext2D, v: ViewConfig, world: World): void {
  const x0 = v.width - 16 - BAR_MAX;
  ctx.fillStyle = 'rgba(232,237,242,0.08)';
  for (const f of world.floors) ctx.fillRect(x0, floorToY(v, f.id) - 3, BAR_MAX, 6);
  for (const f of world.floors) {
    if (f.pressure <= 0) continue;
    const p = f.pressure > 1 ? 1 : f.pressure;
    // Over-capacity floors pulse, phased by tick (deterministic).
    if (f.pressure >= 1) ctx.globalAlpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(world.tick * 0.15));
    ctx.fillStyle = pressureColor(p);
    ctx.fillRect(x0, floorToY(v, f.id) - 3, p * BAR_MAX, 6);
    ctx.globalAlpha = 1;
  }
}

function drawWaiting(ctx: CanvasRenderingContext2D, v: ViewConfig, world: World): void {
  const rightEdge = v.width - 16 - BAR_MAX - 4;
  for (const f of world.floors) {
    const y = floorToY(v, f.id);
    let x = elevatorX(v, world.elevators.length) + 10;
    const n = Math.min(f.waiting.length, MAX_WAITING_DRAWN);
    for (let i = 0; i < n; i++) {
      const p = world.passengers.get(f.waiting[i]);
      if (!p) continue;
      if (x > rightEdge) break;
      const size = 2 + Math.max(1, p.group < 4 ? p.group : 4);
      ctx.fillStyle = ZONE_COLOR[p.destZone];
      ctx.fillRect(x, y - size - 3, size, size);
      x += size + 2;
    }
  }
}

/** Rounded capsule (elevator car): 20×26 with semicircular caps. */
function capsule(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(x - r, y - 3);
  ctx.arc(x, y - 3, r, Math.PI, 0);
  ctx.lineTo(x + r, y + 3);
  ctx.arc(x, y + 3, r, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
}

function drawTransfers(ctx: CanvasRenderingContext2D, v: ViewConfig, world: World): void {
  ctx.strokeStyle = 'rgba(232,237,242,0.16)';
  ctx.lineWidth = 1;
  for (const f of world.floors) {
    let minX = Infinity;
    let maxX = -Infinity;
    let count = 0;
    for (const e of world.elevators) {
      if (!e.stops.includes(f.id)) continue;
      const x = elevatorX(v, e.id);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      count++;
    }
    if (count < 2) continue;
    const y = floorToY(v, f.id);
    ctx.beginPath();
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y);
    ctx.stroke();
  }
}
