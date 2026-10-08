// Pointer + keyboard input (browser layer):
//   - tap a floor band on an elevator's lane -> toggle that floor in its stop list
//   - tap an elevator car                    -> select it / cycle its policy
//   - tap the bottom control bar             -> pause / 1x / 2x
//   - tap an upgrade card while the day-end overlay is up -> pick that upgrade
//   - Space                                  -> pause / resume
//   - 1 / 2                                  -> pick a day-end upgrade
//
// While an overlay owns the screen (game over, day-end upgrade) board taps are
// ignored so a stray touch cannot edit the network behind it.

import { makeView } from './render';
import type { Command, Policy, World } from './types';
import {
  controlBarLayout,
  elevatorX,
  floorToY,
  hitTestElevator,
  hitTestFloor,
  toggleStop,
  upgradeOptionRects,
  type Rect,
} from './view';

export interface InputHandlers {
  onCommand: (cmd: Command) => void;
  getPaused: () => boolean;
  setPaused: (paused: boolean) => void;
  getSpeed: () => number;
  setSpeed: (speed: 1 | 2) => void;
  getSelected: () => number;
  setSelected: (id: number) => void;
}

const POLICIES: readonly Policy[] = ['SCAN', 'ZONE', 'UP_PEAK', 'DOWN_PEAK', 'ALL_CALL'];
/** Half-extents of the car's tap target — matches the drawn car, generous for fingers. */
const CAR_HALF_W = 18;
const CAR_HALF_H = 26;

function canvasPoint(canvas: HTMLCanvasElement, ev: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

/** Inclusive point-in-rect test shared by the control bar and the upgrade cards. */
function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function attachInput(
  canvas: HTMLCanvasElement,
  world: World,
  handlers: InputHandlers,
): () => void {
  const view = () => makeView(canvas.clientWidth, canvas.clientHeight, world);

  /** Id of the elevator whose car (pill) contains the point, if any. */
  const hitCar = (x: number, y: number): number | null => {
    const v = view();
    for (const e of world.elevators) {
      const ex = elevatorX(v, e.id);
      const ey = floorToY(v, e.pos);
      if (Math.abs(x - ex) <= CAR_HALF_W && Math.abs(y - ey) <= CAR_HALF_H) return e.id;
    }
    return null;
  };

  const onPointerDown = (ev: PointerEvent): void => {
    const { x, y } = canvasPoint(canvas, ev);

    // 0) Overlays own the screen: taps can never reach the board behind them.
    if (world.gameOver !== null) return;

    // The layout functions shared with the renderer work in logical CSS pixels;
    // clientWidth is 0 only before first layout, so fall back to the backing store.
    const logicalW = canvas.clientWidth > 0 ? canvas.clientWidth : canvas.width;
    const logicalH = canvas.clientHeight > 0 ? canvas.clientHeight : canvas.height;

    // 1) Day-end upgrade overlay: tap a card to pick it; everything else is inert.
    const offers = world.pendingUpgrade;
    if (offers !== null) {
      const rects = upgradeOptionRects(logicalW, logicalH, offers.length);
      for (const [i, rect] of rects.entries()) {
        const offer = offers[i];
        if (offer !== undefined && pointInRect(x, y, rect)) {
          handlers.onCommand({ t: 'chooseUpgrade', tick: world.tick, kind: offer.kind });
          break;
        }
      }
      return;
    }

    // 2) Bottom control bar: pause + speed selector.
    for (const button of controlBarLayout(logicalW, logicalH).buttons) {
      if (!pointInRect(x, y, button.rect)) continue;
      switch (button.id) {
        case 'pause':
          handlers.setPaused(!handlers.getPaused());
          break;
        case 'speed1':
          handlers.setSpeed(1);
          break;
        case 'speed2':
          handlers.setSpeed(2);
          break;
      }
      return;
    }

    const v = view();

    // 3) Tap the car: select it; tapping the selected car cycles its policy.
    const car = hitCar(x, y);
    if (car !== null) {
      if (handlers.getSelected() === car) {
        const e = world.elevators.find((el) => el.id === car);
        if (e !== undefined) {
          const next = POLICIES[(POLICIES.indexOf(e.policy) + 1) % POLICIES.length];
          handlers.onCommand({ t: 'setPolicy', tick: world.tick, elev: car, policy: next });
        }
      }
      handlers.setSelected(car);
      return;
    }

    // 4) Tap a floor band on a lane: toggle that floor's stop for that elevator.
    const lane = hitTestElevator(v, x, world.elevators.length);
    const floor = hitTestFloor(v, y);
    if (lane === null || floor === null) return;
    const e = world.elevators[lane];
    if (e === undefined) return;
    const next = toggleStop(e.stops, floor);
    if (next !== null) handlers.onCommand({ t: 'setStops', tick: world.tick, elev: e.id, stops: next });
    handlers.setSelected(lane);
  };

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.code === 'Space') {
      ev.preventDefault();
      handlers.setPaused(!handlers.getPaused());
      return;
    }
    const offers = world.pendingUpgrade;
    if (offers !== null && (ev.key === '1' || ev.key === '2')) {
      const offer = offers[ev.key === '1' ? 0 : 1];
      if (offer !== undefined) {
        handlers.onCommand({ t: 'chooseUpgrade', tick: world.tick, kind: offer.kind });
      }
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('keydown', onKeyDown);
  };
}
