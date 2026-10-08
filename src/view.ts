// Pure layout geometry for the building cross-section. No DOM, no canvas:
// rendering and the drag-to-edit stop list both consume these functions.
//
// Screen convention: higher floors render higher, so larger FloorId => smaller y.
// The plot spans [plotTop, plotBottom]; minFloor sits at plotBottom and maxFloor
// at plotTop. Floor bands are centered on floorToY and are bandHeight tall.

import type { FloorId } from './types';

export interface ViewConfig {
  width: number;
  height: number;
  minFloor: FloorId;
  maxFloor: FloorId;
  marginTop: number;
  marginBottom: number;
  /** x of the first elevator shaft. */
  shaftFirstX: number;
  /** Horizontal gap between shafts. */
  shaftGapX: number;
}

export function plotTop(v: ViewConfig): number {
  return v.marginTop;
}

export function plotBottom(v: ViewConfig): number {
  return v.height - v.marginBottom;
}

export function floorBandHeight(v: ViewConfig): number {
  return (plotBottom(v) - plotTop(v)) / (v.maxFloor - v.minFloor + 1);
}

export function floorToY(v: ViewConfig, floor: FloorId): number {
  const span = plotBottom(v) - plotTop(v);
  const steps = v.maxFloor - v.minFloor;
  // Single-floor building: both endpoints coincide, so center the one band.
  if (steps <= 0) return (plotTop(v) + plotBottom(v)) / 2;
  return plotBottom(v) - ((floor - v.minFloor) / steps) * span;
}

export function yToFloor(v: ViewConfig, y: number): number {
  const span = plotBottom(v) - plotTop(v);
  const steps = v.maxFloor - v.minFloor;
  if (steps <= 0) return v.minFloor;
  return v.minFloor + ((plotBottom(v) - y) / span) * steps;
}

export function elevatorX(v: ViewConfig, index: number): number {
  return v.shaftFirstX + index * v.shaftGapX;
}

export function hitTestFloor(v: ViewConfig, y: number): FloorId | null {
  const half = floorBandHeight(v) / 2;
  let best: FloorId | null = null;
  let bestDist = Infinity;
  for (let f = v.minFloor; f <= v.maxFloor; f++) {
    const dist = Math.abs(y - floorToY(v, f));
    if (dist <= half && dist < bestDist) {
      best = f;
      bestDist = dist;
    }
  }
  return best;
}

export function hitTestElevator(v: ViewConfig, x: number, count: number): number | null {
  const tolerance = v.shaftGapX / 2;
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const dist = Math.abs(x - elevatorX(v, i));
    if (dist <= tolerance && dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

export function insertionIndexForStops(currentStops: FloorId[], dropFloor: FloorId): number {
  let i = 0;
  while (i < currentStops.length && currentStops[i] <= dropFloor) i++;
  return i;
}

/**
 * Toggle `floor` in a stop list (tap-to-edit). Returns the new ascending list, or
 * null when removing would leave fewer than two stops (an elevator needs endpoints).
 */
export function toggleStop(currentStops: FloorId[], floor: FloorId): FloorId[] | null {
  const next = currentStops.includes(floor)
    ? currentStops.filter((s) => s !== floor)
    : [...currentStops, floor].sort((a, b) => a - b);
  return next.length >= 2 ? next : null;
}

// ---------------------------------------------------------------------------
// Portrait layout primitives (mobile). Pure geometry: render/input map these
// rects onto the canvas and hit-test taps against them. No DOM here.

export const PORTRAIT_MAX_WIDTH = 460;
export const CONTROL_BAR_H = 64;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ControlButtonId = 'pause' | 'speed1' | 'speed2';

export interface ControlBarLayout {
  bar: Rect;
  buttons: { id: ControlButtonId; rect: Rect }[];
}

/** Left gutter reserved for floor labels (label text stays left of this line). */
export const PORTRAIT_LEFT_GUTTER = 92;
/** Pressure-bar column: this wide, this far from the right edge. */
export const PRESSURE_BAR_MAX = 60;
export const PRESSURE_BAR_RIGHT_INSET = 10;
// Stats panel above the plot (5 stat lines, plus a pause line when paused
// ≈158px tall incl. inset); the plot must start below it so the top floor band
// is never hidden. Control bar + hint line below the plot.
const PORTRAIT_MARGIN_TOP = 172;
const PORTRAIT_HINT_H = 32;
// Shaft spacing: roomy by default, shrinking only as far as needed to keep every
// whole car clear of the gutters.
const SHAFT_GAP_MAX = 56;
/** Elevator car half-width (render's CAR_W / 2) — cars, not just shaft centers. */
const CAR_HALF = 17;
/** Breathing room between a car edge and a gutter. */
const EDGE_CLEAR = 3;
/**
 * Right-side strip kept clear of shafts so waiting badges always have room.
 * Sized so that at the elevator cap (MAX_ELEVATORS) cars still keep full car-width
 * spacing — no car-to-car overlap on the reference 390px width.
 */
const WAITING_BADGE_AREA = 52;
// Touch targets: minimum tappable square and the control bar's horizontal inset.
const TAP_MIN = 44;
const CONTROL_INSET = 12;
const CONTROL_BUTTON_GAP = 12;
// Day-end upgrade cards.
const UPGRADE_INSET = 24;
const UPGRADE_CARD_H = 72;
const UPGRADE_CARD_GAP = 12;
const UPGRADE_MAX_CARD_W = 360;

/** Min/max stop floor, or null when the stop list is empty. Single stop => lo===hi. */
export function stopExtent(stops: readonly FloorId[]): { lo: FloorId; hi: FloorId } | null {
  if (stops.length === 0) return null;
  let lo = stops[0];
  let hi = stops[0];
  for (const floor of stops) {
    if (floor < lo) lo = floor;
    if (floor > hi) hi = floor;
  }
  return { lo, hi };
}

/**
 * Portrait cross-section layout. Guards elevatorCount<=0 (no NaN/divide-by-zero).
 * Reserves a top margin for the stats panel (~172, enough for the 5 stat lines
 * plus the paused line) and a bottom margin for the bottom control bar + hint
 * (>= CONTROL_BAR_H + 32). Centers the elevator shafts inside a whole-car safe
 * band (label gutter left, pressure-bar column right) so outer cars never
 * overlap either; shaftGapX caps at 56 and shrinks as cars are added
 * (<=0 count => gap 0).
 */
export function portraitLayout(
  width: number,
  height: number,
  elevatorCount: number,
): { marginTop: number; marginBottom: number; shaftFirstX: number; shaftGapX: number } {
  const marginTop = PORTRAIT_MARGIN_TOP;
  const marginBottom = CONTROL_BAR_H + PORTRAIT_HINT_H;
  // Whole-car safe band: label gutter on the left, a waiting-badge strip plus
  // the pressure-bar column on the right. Using car edges (not shaft centers)
  // keeps outer cars out of the gutters and leaves room for waiting badges.
  const leftSafe = PORTRAIT_LEFT_GUTTER + EDGE_CLEAR + CAR_HALF;
  const pressureLeft = width - PRESSURE_BAR_RIGHT_INSET - PRESSURE_BAR_MAX;
  const rightSafe = pressureLeft - WAITING_BADGE_AREA - EDGE_CLEAR - CAR_HALF;
  const centerX = (leftSafe + rightSafe) / 2;
  if (elevatorCount <= 0) {
    return { marginTop, marginBottom, shaftFirstX: centerX, shaftGapX: 0 };
  }
  const available = Math.max(0, rightSafe - leftSafe);
  const shaftGapX =
    elevatorCount === 1 ? SHAFT_GAP_MAX : Math.min(SHAFT_GAP_MAX, available / (elevatorCount - 1));
  const span = (elevatorCount - 1) * shaftGapX;
  return { marginTop, marginBottom, shaftFirstX: centerX - span / 2, shaftGapX };
}

/**
 * Bottom control bar: a full-width bar of height CONTROL_BAR_H pinned to the
 * bottom of a `height`-tall canvas. Buttons laid L→R: pause, speed1, speed2.
 * Each button is >= 44x44, non-overlapping, fully inside the canvas, and inset
 * 12px from the horizontal edges.
 */
export function controlBarLayout(width: number, height: number): ControlBarLayout {
  const bar: Rect = { x: 0, y: height - CONTROL_BAR_H, w: width, h: CONTROL_BAR_H };
  const ids: ControlButtonId[] = ['pause', 'speed1', 'speed2'];
  const available = Math.max(0, width - 2 * CONTROL_INSET - (ids.length - 1) * CONTROL_BUTTON_GAP);
  const buttonW = Math.max(TAP_MIN, available / ids.length);
  const buttonH = Math.max(TAP_MIN, CONTROL_BAR_H - 2 * CONTROL_INSET);
  const buttonY = bar.y + (CONTROL_BAR_H - buttonH) / 2;
  const buttons = ids.map((id, i) => ({
    id,
    rect: {
      x: CONTROL_INSET + i * (buttonW + CONTROL_BUTTON_GAP),
      y: buttonY,
      w: buttonW,
      h: buttonH,
    },
  }));
  return { bar, buttons };
}

/**
 * Tappable day-end upgrade cards, stacked vertically top→bottom and centered.
 * `count` cards, each >= 44px tall, non-overlapping, fully inside the canvas.
 * Return [] when count<=0.
 */
export function upgradeOptionRects(width: number, height: number, count: number): Rect[] {
  if (count <= 0) return [];
  const cardW = Math.max(TAP_MIN, Math.min(UPGRADE_MAX_CARD_W, width - 2 * UPGRADE_INSET));
  const maxFitH = (height - 2 * UPGRADE_INSET - (count - 1) * UPGRADE_CARD_GAP) / count;
  const cardH = Math.min(UPGRADE_CARD_H, Math.max(TAP_MIN, maxFitH));
  const stackH = count * cardH + (count - 1) * UPGRADE_CARD_GAP;
  const top = (height - stackH) / 2;
  const x = (width - cardW) / 2;
  return Array.from({ length: count }, (_, i) => ({
    x,
    y: top + i * (cardH + UPGRADE_CARD_GAP),
    w: cardW,
    h: cardH,
  }));
}
