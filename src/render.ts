// Canvas 2D drawing layer for the building cross-section (light paper,
// Mini-Metro-like). Deterministic only: no randomness, no clocks, no DOM
// lookups — everything derives from `world` and the pure view geometry.

import { LOBBY_FLOOR } from './config';
import type { Elevator, FloorId, Passenger, Phase, World, Zone } from './types';
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

const FONT = '11px system-ui';
const MUTED = '#6b7280';
/** Background gradient [top, bottom] per phase — near-white paper tints. */
const PHASE_SKY: Record<Phase, readonly [string, string]> = {
  morning: ['#f7f4ec', '#f2efe6'],
  midday: ['#f7f7f2', '#f1f1ec'],
  evening: ['#f8f0e6', '#f3e9de'],
  night: ['#eef1f5', '#e7ebf1'],
};
const BAR_MAX = 60;
const BAR_H = 4;
/** Destination badge: a ~12px zone-colored square carrying the floor number. */
const BADGE = 12;
const BADGE_GAP = 3;
const BADGE_FONT = '9px system-ui';
/** Dark ink reads ≥~4.9:1 on every zone color at this size. */
const BADGE_INK = '#1a1d22';
const HOLLOW = 'rgba(40,44,52,0.4)';
/** Faint neutral bar for floors an elevator passes without stopping. */
const SKIP_COLOR = 'rgba(40,44,52,0.18)';
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
  drawBackground(ctx, v, world);
  drawFloorBands(ctx, v, world);
  drawPressureBars(ctx, v, world);
  drawWaiting(ctx, v, world);
  // Elevators: route track, stop rings / skip bars, interpolated car, selection.
  const top = plotTop(v);
  const bottom = plotBottom(v);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of world.elevators) {
    const x = elevatorX(v, e.id);
    // Soft route track: the line's own color, low alpha, round caps.
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, top + 3);
    ctx.lineTo(x, bottom - 3);
    ctx.stroke();
    ctx.restore();
    // Stop / skip language: a ring = the car stops here; a faint horizontal
    // bar = the car passes through without stopping (express).
    if (e.stops.length > 0) {
      let lo = e.stops[0];
      let hi = e.stops[0];
      for (const s of e.stops) {
        if (s < lo) lo = s;
        if (s > hi) hi = s;
      }
      const stops = new Set(e.stops);
      ctx.fillStyle = SKIP_COLOR;
      for (const f of world.floors) {
        if (f.id < lo || f.id > hi || stops.has(f.id)) continue;
        ctx.fillRect(x - 4, floorToY(v, f.id) - 1, 8, 2);
      }
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      for (const s of e.stops) {
        ctx.beginPath();
        ctx.arc(x, floorToY(v, s), 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const y = floorToY(v, e.posPrev + (e.pos - e.posPrev) * a);
    ctx.fillStyle = e.color;
    roundRectPath(ctx, { x: x - CAR_W / 2, y: y - CAR_H / 2, w: CAR_W, h: CAR_H, radius: CAR_R });
    ctx.fill();
    if (e.id === selectedElevator) {
      // Thin, quiet selection ring — never a harsh outline.
      ctx.strokeStyle = 'rgba(20,22,26,0.5)';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, {
        x: x - CAR_W / 2 - 3,
        y: y - CAR_H / 2 - 3,
        w: CAR_W + 6,
        h: CAR_H + 6,
        radius: CAR_R + 2,
      });
      ctx.stroke();
    }
    drawRiders(ctx, world, e, x, y);
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

/** Ink (dark or white) that stays legible on top of `bg`. */
function readableInk(bg: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(bg.trim());
  if (hex === null) return '#ffffff';
  const n = parseInt(hex[1], 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 150 ? '#1a1d22' : '#ffffff';
}

/** The passenger's ultimate destination floor (final leg's alight floor), or null. */
function destFloorOf(p: Passenger): FloorId | null {
  return p.plan.length > 0 ? p.plan[p.plan.length - 1].alightFloor : null;
}

/** Elevator car: big enough to show each rider's destination badge. */
const CAR_W = 34;
const CAR_H = 50;
const CAR_R = 13;
/** Rider badges inside the car: 2-wide × 3-tall grid, then a `+N` for extras. */
const RIDER_MAX = 6;
const RIDER_BADGE = 11;
const RIDER_GAP = 2;
const RIDER_FONT = '8px system-ui';

/**
 * Draw the passengers riding inside the car: up to 6 destination badges (the
 * same language as the platform — zone color + destination floor number) in a
 * 2-wide × 3-tall grid. Extra riders collapse into a tiny `+N`. Empty car draws
 * nothing.
 */
function drawRiders(
  ctx: CanvasRenderingContext2D,
  world: World,
  e: Elevator,
  cx: number,
  cy: number,
): void {
  const n = e.load.length;
  if (n === 0) return;
  const shown = n > RIDER_MAX ? RIDER_MAX : n;
  const overflow = n > shown;
  const rows = Math.ceil(shown / 2);
  const step = RIDER_BADGE + RIDER_GAP;
  const startY = cy - ((rows - 1) * step) / 2 + (overflow ? -5 : 0);
  ctx.save();
  ctx.font = RIDER_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < shown; i++) {
    const p = world.passengers.get(e.load[i]);
    if (p === undefined) continue;
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = cx + (col === 0 ? -step / 2 : step / 2) - RIDER_BADGE / 2;
    const by = startY + row * step - RIDER_BADGE / 2;
    roundRectPath(ctx, { x: bx, y: by, w: RIDER_BADGE, h: RIDER_BADGE, radius: 3 });
    const dest = destFloorOf(p);
    if (dest === null) {
      // No plan (unreachable): hollow badge, no number.
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = ZONE_COLOR[p.destZone];
      ctx.fill();
      ctx.fillStyle = BADGE_INK;
      ctx.fillText(dest < 0 ? `B${-dest}` : String(dest), bx + RIDER_BADGE / 2, by + RIDER_BADGE / 2);
    }
  }
  if (overflow) {
    ctx.fillStyle = readableInk(e.color);
    ctx.fillText(`+${n - shown}`, cx, cy + 19);
  }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, v: ViewConfig, world: World): void {
  const [top, bottom] = PHASE_SKY[world.phase];
  const g = ctx.createLinearGradient(0, 0, 0, v.height);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.width, v.height);
  // Static city silhouette in the left third — texture only, kept far below
  // the building in contrast and height so it never competes with it.
  const third = v.width / 3;
  const base = plotBottom(v);
  const plotH = base - plotTop(v);
  ctx.fillStyle = 'rgba(40,44,52,0.06)';
  for (const [fx, fw, hf] of SKYLINE) {
    const bh = hf * plotH * 0.5;
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
      ? 'rgba(224,176,46,0.5)'
      : isSky
        ? 'rgba(46,134,228,0.5)'
        : 'rgba(40,44,52,0.14)';
    ctx.fillRect(16, y - (accent ? 1 : 0), v.width - 32, accent ? 2 : 1);
    // Floor labels: small, muted; accent floors only a touch darker.
    ctx.fillStyle = accent ? '#4b5563' : MUTED;
    ctx.fillText(f.name, 16, y - 8);
  }
}

function drawPressureBars(ctx: CanvasRenderingContext2D, v: ViewConfig, world: World): void {
  const x0 = v.width - 24 - BAR_MAX;
  ctx.fillStyle = 'rgba(40,44,52,0.08)';
  for (const f of world.floors) {
    roundRectPath(ctx, { x: x0, y: floorToY(v, f.id) - BAR_H / 2, w: BAR_MAX, h: BAR_H, radius: BAR_H / 2 });
    ctx.fill();
  }
  for (const f of world.floors) {
    if (f.pressure <= 0) continue;
    const p = f.pressure > 1 ? 1 : f.pressure;
    // Over-capacity floors pulse, phased by tick (deterministic).
    if (f.pressure >= 1) ctx.globalAlpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(world.tick * 0.15));
    ctx.fillStyle = pressureColor(p);
    roundRectPath(ctx, { x: x0, y: floorToY(v, f.id) - BAR_H / 2, w: p * BAR_MAX, h: BAR_H, radius: BAR_H / 2 });
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawWaiting(ctx: CanvasRenderingContext2D, v: ViewConfig, world: World): void {
  const rightEdge = v.width - 24 - BAR_MAX - 6;
  ctx.save();
  ctx.font = BADGE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of world.floors) {
    const y = floorToY(v, f.id);
    let x = elevatorX(v, world.elevators.length) + 12;
    const n = Math.min(f.waiting.length, MAX_WAITING_DRAWN);
    for (let i = 0; i < n; i++) {
      const p = world.passengers.get(f.waiting[i]);
      if (!p) continue;
      if (x + BADGE > rightEdge) break;
      // Destination badge: zone color + the final leg's alight floor number.
      const dest = destFloorOf(p);
      const top = y - 4 - BADGE;
      roundRectPath(ctx, { x, y: top, w: BADGE, h: BADGE, radius: 3 });
      if (dest === null) {
        // Stranded / unreachable: hollow neutral badge, no number.
        ctx.strokeStyle = HOLLOW;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = ZONE_COLOR[p.destZone];
        ctx.fill();
        ctx.fillStyle = BADGE_INK;
        ctx.fillText(dest < 0 ? `B${-dest}` : String(dest), x + BADGE / 2, top + BADGE / 2);
      }
      x += BADGE + BADGE_GAP;
    }
  }
  ctx.restore();
}

/** Shared rounded-rect path (flat + restrained radii, Mini-Metro style). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number; radius: number },
): void {
  const { x, y, w, h, radius } = r;
  const rad = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawTransfers(ctx: CanvasRenderingContext2D, v: ViewConfig, world: World): void {
  ctx.strokeStyle = 'rgba(40,44,52,0.12)';
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
