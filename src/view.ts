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
