import { describe, expect, it } from 'vitest';
import type { ControlBarLayout, ControlButtonId, Rect } from '../src/view';
import {
  CONTROL_BAR_H,
  PORTRAIT_MAX_WIDTH,
  controlBarLayout,
  portraitLayout,
  stopExtent,
  upgradeOptionRects,
} from '../src/view';

// Portrait phone reference canvas (iPhone 12/13 logical pixels).
const W = 390;
const H = 844;
// Whole-car safe band — must mirror src/view.ts (label gutter 92 | waiting strip
// 66 | pressure col at 320).
const LEFT_GUTTER = 92;
const PRESSURE_LEFT = W - 10 - 60; // 320 (PRESSURE_BAR_RIGHT_INSET + PRESSURE_BAR_MAX)
const CAR_HALF = 17; // render CAR_W / 2
const CAR_W = 2 * CAR_HALF;
const WAITING_AREA = 52; // reserved to the right of the shafts for waiting badges
const LEFT_SAFE = LEFT_GUTTER + 3 + CAR_HALF; // 112
const RIGHT_SAFE = PRESSURE_LEFT - WAITING_AREA - 3 - CAR_HALF; // 248
const BAND_CENTER = (LEFT_SAFE + RIGHT_SAFE) / 2; // 180
const AVAILABLE = RIGHT_SAFE - LEFT_SAFE; // 136
const MAX_ELEVATORS = 5;

function isInsideCanvas(r: Rect, width: number, height: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('view layout constants', () => {
  it('exposes the portrait width cap and the control bar height', () => {
    expect(PORTRAIT_MAX_WIDTH).toBe(460);
    expect(CONTROL_BAR_H).toBe(64);
  });
});

describe('stopExtent', () => {
  it('returns null for an empty stop list', () => {
    expect(stopExtent([])).toBeNull();
  });

  it('returns lo === hi for a single stop', () => {
    const extent = stopExtent([5] as const);
    expect(extent).toEqual({ lo: 5, hi: 5 });
    expect(extent?.lo).toBe(extent?.hi);
  });

  it('returns min and max for an unsorted multi-stop list', () => {
    expect(stopExtent([9, 2, 11, 5])).toEqual({ lo: 2, hi: 11 });
  });

  it('does not mutate its input and accepts readonly lists', () => {
    const stops: readonly number[] = [9, 2, 11, 5];
    expect(stopExtent(stops)).toEqual({ lo: 2, hi: 11 });
    expect(stops).toEqual([9, 2, 11, 5]);
  });

  it('handles repeated floors', () => {
    expect(stopExtent([-3, -3, -7])).toEqual({ lo: -7, hi: -3 });
  });
});

describe('portraitLayout', () => {
  it('reserves a stats-panel top margin and a control-bar bottom margin', () => {
    const layout = portraitLayout(W, H, 2);
    // The HUD stats panel is ~158px tall with the paused line, so the plot must
    // start below it or the top floor band would be hidden behind the panel.
    expect(layout.marginTop).toBeGreaterThanOrEqual(170);
    expect(layout.marginTop).toBeLessThanOrEqual(200);
    expect(layout.marginBottom).toBeGreaterThanOrEqual(CONTROL_BAR_H + 32);
  });

  it('returns finite numbers and gap 0 when there are no elevators', () => {
    const layout = portraitLayout(W, H, 0);
    expect(layout.shaftGapX).toBe(0);
    expect(layout.shaftFirstX).toBeCloseTo(BAND_CENTER, 10);
    expect(Number.isFinite(layout.shaftFirstX)).toBe(true);
    expect(Number.isFinite(layout.marginTop)).toBe(true);
    expect(Number.isFinite(layout.marginBottom)).toBe(true);
  });

  it('treats a negative elevator count like zero', () => {
    const layout = portraitLayout(W, H, -3);
    expect(layout.shaftGapX).toBe(0);
    expect(Number.isFinite(layout.shaftFirstX)).toBe(true);
  });

  it('centers a single shaft in the band with a positive gap', () => {
    const layout = portraitLayout(W, H, 1);
    expect(layout.shaftFirstX).toBeCloseTo(BAND_CENTER, 10);
    expect(layout.shaftGapX).toBeGreaterThan(0);
    expect(layout.shaftGapX).toBeLessThanOrEqual(56);
  });

  it('centers two shafts with the 56px spacing cap', () => {
    const layout = portraitLayout(W, H, 2);
    expect(layout.shaftGapX).toBeCloseTo(56, 10);
    const first = layout.shaftFirstX;
    const second = first + layout.shaftGapX;
    expect(first).toBeCloseTo(BAND_CENTER - 28, 10); // 145
    expect(second).toBeCloseTo(BAND_CENTER + 28, 10); // 201
    // Whole cars (not just shaft centers) stay clear of both gutters.
    expect(first - CAR_HALF).toBeGreaterThanOrEqual(LEFT_GUTTER);
    expect(second + CAR_HALF).toBeLessThanOrEqual(PRESSURE_LEFT);
  });

  it('keeps every whole car clear of the gutters and leaves badge room for many shafts', () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 12]) {
      const layout = portraitLayout(W, H, count);
      const first = layout.shaftFirstX;
      const last = first + (count - 1) * layout.shaftGapX;
      expect(first - CAR_HALF, `count ${count} left car`).toBeGreaterThanOrEqual(LEFT_GUTTER);
      expect(last + CAR_HALF, `count ${count} right car`).toBeLessThanOrEqual(PRESSURE_LEFT);
      // Room for waiting badges to the right of the last car.
      expect(PRESSURE_LEFT - (last + CAR_HALF), `count ${count} badge room`).toBeGreaterThanOrEqual(
        WAITING_AREA - 1e-9,
      );
      expect(first - CAR_HALF, `count ${count} on-canvas left`).toBeGreaterThanOrEqual(0);
      expect(last + CAR_HALF, `count ${count} on-canvas right`).toBeLessThanOrEqual(W);
      expect((first + last) / 2, `count ${count} centered`).toBeCloseTo(BAND_CENTER, 8);
    }
  });

  it('keeps cars from overlapping each other up to the elevator cap', () => {
    for (let count = 2; count <= MAX_ELEVATORS; count++) {
      const gap = portraitLayout(W, H, count).shaftGapX;
      expect(gap, `count ${count} gap`).toBeGreaterThanOrEqual(CAR_W - 1e-9);
    }
  });

  it('caps spacing at 56 and shrinks it monotonically to fit the band', () => {
    const counts = [2, 3, 4, 5, 6, 7, 8, 9, 12];
    const gaps = counts.map((c) => portraitLayout(W, H, c).shaftGapX);
    for (let i = 0; i < gaps.length; i++) {
      expect(gaps[i]).toBeGreaterThan(0);
      expect(gaps[i]).toBeLessThanOrEqual(56);
      if (i > 0) expect(gaps[i]).toBeLessThanOrEqual(gaps[i - 1]);
    }
    // Past the cap the gap shrinks below 56...
    expect(portraitLayout(W, H, 12).shaftGapX).toBeLessThan(56);
    // ...but the shaft span never exceeds the whole-car safe band.
    expect(portraitLayout(W, H, 12).shaftGapX * 11).toBeLessThanOrEqual(AVAILABLE + 1e-9);
  });

  it('keeps the shaft group centered in the band for any count', () => {
    for (const count of [0, 1, 2, 3, 8]) {
      const layout = portraitLayout(W, H, count);
      const groupCenter = layout.shaftFirstX + ((count - 1) * layout.shaftGapX) / 2;
      expect(groupCenter).toBeCloseTo(BAND_CENTER, 8);
    }
  });
});

describe('controlBarLayout', () => {
  const layout: ControlBarLayout = controlBarLayout(W, H);

  it('pins a full-width bar of height CONTROL_BAR_H to the bottom', () => {
    expect(layout.bar).toEqual({ x: 0, y: H - CONTROL_BAR_H, w: W, h: CONTROL_BAR_H });
  });

  it('lays out pause, speed1, speed2 left to right', () => {
    const ids: ControlButtonId[] = layout.buttons.map((b) => b.id);
    expect(ids).toEqual(['pause', 'speed1', 'speed2']);
  });

  it('keeps every button at least 44x44 and inside the bar', () => {
    for (const { rect } of layout.buttons) {
      expect(rect.w).toBeGreaterThanOrEqual(44);
      expect(rect.h).toBeGreaterThanOrEqual(44);
      expect(rect.y).toBeGreaterThanOrEqual(layout.bar.y);
      expect(rect.y + rect.h).toBeLessThanOrEqual(layout.bar.y + layout.bar.h);
    }
  });

  it('does not overlap buttons and respects the 12px horizontal inset', () => {
    const rects = layout.buttons.map((b) => b.rect);
    for (const rect of rects) expect(isInsideCanvas(rect, W, H)).toBe(true);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i], rects[j])).toBe(false);
      }
    }
    expect(rects[0].x).toBeGreaterThanOrEqual(12);
    const last = rects[rects.length - 1];
    expect(last.x + last.w).toBeLessThanOrEqual(W - 12);
  });

  it('keeps the same guarantees on a wider canvas', () => {
    const rects = controlBarLayout(460, 900).buttons.map((b) => b.rect);
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].x).toBeGreaterThanOrEqual(rects[i - 1].x + rects[i - 1].w);
    }
    for (const rect of rects) expect(isInsideCanvas(rect, 460, 900)).toBe(true);
  });
});

describe('upgradeOptionRects', () => {
  it('returns no cards for a non-positive count', () => {
    expect(upgradeOptionRects(W, H, 0)).toEqual([]);
    expect(upgradeOptionRects(W, H, -2)).toEqual([]);
  });

  it('returns a single tappable card centered horizontally', () => {
    const cards = upgradeOptionRects(W, H, 1);
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.h).toBeGreaterThanOrEqual(44);
    expect(card.x + card.w / 2).toBeCloseTo(W / 2, 8);
    expect(isInsideCanvas(card, W, H)).toBe(true);
  });

  it('stacks three equal cards top to bottom without overlap', () => {
    const cards = upgradeOptionRects(W, H, 3);
    expect(cards).toHaveLength(3);
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      expect(card.h).toBeGreaterThanOrEqual(44);
      expect(isInsideCanvas(card, W, H)).toBe(true);
      expect(card.x).toBeCloseTo(cards[0].x, 8);
      expect(card.w).toBeCloseTo(cards[0].w, 8);
      expect(card.x + card.w / 2).toBeCloseTo(W / 2, 8);
      if (i > 0) {
        expect(card.y).toBeGreaterThan(cards[i - 1].y);
        expect(cards[i - 1].y + cards[i - 1].h).toBeLessThanOrEqual(card.y);
      }
    }
  });
});
