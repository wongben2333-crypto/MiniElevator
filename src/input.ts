// Pointer + keyboard input (browser layer):
//   - click a shaft        -> select that elevator
//   - click selected shaft -> cycle its policy
//   - drag across floors   -> add that floor range to the selected elevator's stops
//   - click a single floor -> toggle it in/out of the selected elevator's stops
//   - Space                -> pause / resume
//   - 1 / 2                -> pick a day-end upgrade

import { makeView } from './render';
import type { Command, Policy, World } from './types';
import { hitTestElevator, hitTestFloor, insertionIndexForStops } from './view';

export interface InputHandlers {
  onCommand: (cmd: Command) => void;
  getPaused: () => boolean;
  setPaused: (paused: boolean) => void;
  getSelected: () => number;
  setSelected: (id: number) => void;
}

const POLICIES: readonly Policy[] = ['SCAN', 'ZONE', 'UP_PEAK', 'DOWN_PEAK', 'ALL_CALL'];

function canvasPoint(canvas: HTMLCanvasElement, ev: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function insertSorted(stops: readonly number[], floor: number): number[] {
  const next = [...stops];
  next.splice(insertionIndexForStops(next, floor), 0, floor);
  return next;
}

/** Build the stop-list command for a completed drag on the selected elevator. */
function commitDrag(
  world: World,
  elevId: number,
  startFloor: number,
  endFloor: number,
): Command | null {
  const e = world.elevators.find((x) => x.id === elevId);
  if (e === undefined) return null;

  let stops = [...e.stops];
  if (startFloor === endFloor) {
    stops = stops.includes(startFloor)
      ? stops.filter((s) => s !== startFloor)
      : insertSorted(stops, startFloor);
  } else {
    const lo = Math.min(startFloor, endFloor);
    const hi = Math.max(startFloor, endFloor);
    const range = world.floors
      .map((f) => f.id)
      .filter((id) => id >= lo && id <= hi)
      .sort((a, b) => a - b);
    for (const id of range) if (!stops.includes(id)) stops = insertSorted(stops, id);
  }
  return { t: 'setStops', tick: world.tick, elev: elevId, stops };
}

export function attachInput(
  canvas: HTMLCanvasElement,
  world: World,
  handlers: InputHandlers,
): () => void {
  let dragging = false;
  let startFloor: number | null = null;
  let lastFloor: number | null = null;

  const view = () => makeView(canvas.clientWidth, canvas.clientHeight, world);

  const onPointerDown = (ev: PointerEvent): void => {
    const { x, y } = canvasPoint(canvas, ev);
    const shaft = hitTestElevator(view(), x, world.elevators.length);
    if (shaft !== null) {
      if (handlers.getSelected() === shaft) {
        const e = world.elevators[shaft];
        const next = POLICIES[(POLICIES.indexOf(e.policy) + 1) % POLICIES.length];
        handlers.onCommand({ t: 'setPolicy', tick: world.tick, elev: shaft, policy: next });
      }
      handlers.setSelected(shaft);
      dragging = false;
      return;
    }
    if (handlers.getSelected() >= 0) {
      const f = hitTestFloor(view(), y);
      if (f !== null) {
        dragging = true;
        startFloor = f;
        lastFloor = f;
      }
    }
  };

  const onPointerMove = (ev: PointerEvent): void => {
    if (!dragging) return;
    const f = hitTestFloor(view(), canvasPoint(canvas, ev).y);
    if (f !== null) lastFloor = f;
  };

  const onPointerUp = (ev: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    const endFloor = hitTestFloor(view(), canvasPoint(canvas, ev).y) ?? lastFloor;
    if (startFloor !== null && endFloor !== null) {
      const cmd = commitDrag(world, handlers.getSelected(), startFloor, endFloor);
      if (cmd !== null) handlers.onCommand(cmd);
    }
    startFloor = null;
    lastFloor = null;
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
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
  };
}
