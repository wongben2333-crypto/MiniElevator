// Pointer + keyboard input (browser layer):
//   - tap a floor band on an elevator's lane -> toggle that floor in its stop list
//   - tap an elevator car                    -> select it / cycle its policy
//   - Space                                  -> pause / resume
//   - 1 / 2                                  -> pick a day-end upgrade

import { makeView } from './render';
import type { Command, Policy, World } from './types';
import { elevatorX, floorToY, hitTestElevator, hitTestFloor, toggleStop } from './view';

export interface InputHandlers {
  onCommand: (cmd: Command) => void;
  getPaused: () => boolean;
  setPaused: (paused: boolean) => void;
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
    const v = view();

    // 1) Tap the car: select it; tapping the selected car cycles its policy.
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

    // 2) Tap a floor band on a lane: toggle that floor's stop for that elevator.
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
