import { describe, expect, it } from 'vitest';
import type { FloorId } from '../src/types';
import type { ViewConfig } from '../src/view';
import {
  elevatorX,
  floorBandHeight,
  floorToY,
  hitTestElevator,
  hitTestFloor,
  insertionIndexForStops,
  plotBottom,
  plotTop,
  toggleStop,
  yToFloor,
} from '../src/view';

// 800x600 plot with 40px vertical margins: plotTop=40, plotBottom=560, span=520.
// 10 floors (1..10) => band height 52, center-to-center step ~57.78 (bands have gaps).
const view: ViewConfig = {
  width: 800,
  height: 600,
  minFloor: 1,
  maxFloor: 10,
  marginTop: 40,
  marginBottom: 40,
  shaftFirstX: 100,
  shaftGapX: 80,
};

const allFloors: FloorId[] = [];
for (let f = view.minFloor; f <= view.maxFloor; f++) allFloors.push(f);

describe('view geometry', () => {
  describe('plotTop / plotBottom / floorBandHeight', () => {
    it('derives plot edges from the margins and the band height from the floor count', () => {
      expect(plotTop(view)).toBe(40);
      expect(plotBottom(view)).toBe(560);
      expect(floorBandHeight(view)).toBeCloseTo(520 / 10, 10);
    });
  });

  describe('floorToY', () => {
    it('maps minFloor to plotBottom and maxFloor to plotTop', () => {
      expect(floorToY(view, view.minFloor)).toBeCloseTo(plotBottom(view), 10);
      expect(floorToY(view, view.maxFloor)).toBeCloseTo(plotTop(view), 10);
    });

    it('decreases strictly as the floor rises', () => {
      const ys = allFloors.map((f) => floorToY(view, f));
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i]).toBeLessThan(ys[i - 1]);
      }
    });
  });

  describe('yToFloor', () => {
    it('is the inverse of floorToY within epsilon', () => {
      for (const f of allFloors) {
        expect(yToFloor(view, floorToY(view, f))).toBeCloseTo(f, 6);
      }
    });

    it('round-trips arbitrary y back to a y within epsilon', () => {
      const ys = [40, 100.5, 300, 559.25];
      for (const y of ys) {
        expect(floorToY(view, yToFloor(view, y))).toBeCloseTo(y, 6);
      }
    });
  });

  describe('hitTestFloor', () => {
    it('returns the floor whose band contains the point', () => {
      for (const f of allFloors) {
        expect(hitTestFloor(view, floorToY(view, f))).toBe(f);
      }
    });

    it('returns the floor for points near the band edges', () => {
      const half = floorBandHeight(view) / 2;
      const center = floorToY(view, 5);
      expect(hitTestFloor(view, center + half * 0.9)).toBe(5);
      expect(hitTestFloor(view, center - half * 0.9)).toBe(5);
    });

    it('returns null outside every band', () => {
      expect(hitTestFloor(view, plotTop(view) - floorBandHeight(view))).toBeNull();
      expect(hitTestFloor(view, plotBottom(view) + floorBandHeight(view))).toBeNull();
    });

    it('returns null in a gap between two adjacent bands', () => {
      // Bands are centered on floorToY and narrower than the center-to-center step.
      const midpoint = (floorToY(view, 5) + floorToY(view, 6)) / 2;
      expect(hitTestFloor(view, midpoint)).toBeNull();
    });
  });

  describe('elevatorX / hitTestElevator', () => {
    it('spaces shafts by shaftGapX from shaftFirstX', () => {
      expect(elevatorX(view, 0)).toBe(100);
      expect(elevatorX(view, 3)).toBe(340);
    });

    it('returns the shaft index nearest the pointer within half the gap', () => {
      expect(hitTestElevator(view, elevatorX(view, 0), 5)).toBe(0);
      expect(hitTestElevator(view, elevatorX(view, 2), 5)).toBe(2);
      expect(hitTestElevator(view, elevatorX(view, 1) + view.shaftGapX * 0.49, 5)).toBe(1);
      expect(hitTestElevator(view, elevatorX(view, 1) + view.shaftGapX * 0.51, 5)).toBe(2);
    });

    it('returns null beyond half the gap from every shaft', () => {
      expect(hitTestElevator(view, elevatorX(view, 0) - view.shaftGapX / 2 - 1, 5)).toBeNull();
      expect(hitTestElevator(view, elevatorX(view, 4) + view.shaftGapX / 2 + 1, 5)).toBeNull();
    });

    it('returns null when there are no shafts', () => {
      expect(hitTestElevator(view, 100, 0)).toBeNull();
    });
  });

  describe('insertionIndexForStops', () => {
    const stops: FloorId[] = [2, 5, 9];

    it('inserts before the first stop when the drop floor is lower than all', () => {
      expect(insertionIndexForStops(stops, 1)).toBe(0);
    });

    it('inserts between stops when the drop floor lands in the middle', () => {
      expect(insertionIndexForStops(stops, 6)).toBe(2);
    });

    it('appends when the drop floor is higher than all', () => {
      expect(insertionIndexForStops(stops, 10)).toBe(3);
    });

    it('appends into an empty stop list', () => {
      expect(insertionIndexForStops([], 4)).toBe(0);
    });

    it('inserts after equal stops to keep the list ascending', () => {
      expect(insertionIndexForStops([2, 5, 5, 9], 5)).toBe(3);
    });
  });

  describe('toggleStop', () => {
    it('adds a missing floor in ascending order', () => {
      expect(toggleStop([1, 5], 3)).toEqual([1, 3, 5]);
    });

    it('removes an existing floor', () => {
      expect(toggleStop([1, 3, 5], 3)).toEqual([1, 5]);
    });

    it('refuses to drop below two stops', () => {
      expect(toggleStop([1, 2], 1)).toBeNull();
      expect(toggleStop([1, 2], 2)).toBeNull();
    });
  });
});
