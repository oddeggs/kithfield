import { timing, type Box, type FlightOptions } from '../../ui/travel';
import { FLAME, LOOP_BASE, LOOP_FLAME } from './fire-art';
import { SCENE_LIFT } from './fire-scene';
import { FIRE_AT } from './seats';

/*
 * The fire's way in (signature motion): the farm zooms toward its fire ring and its flame flies
 * to where the fire room draws its own, growing to its size as the room fades up over it.
 */

/** The square `fireLoop` draws a flame `flame` wide in, its base at (`x`, `y`). */
export function flameSquare(x: number, y: number, flame: number): Box {
  const size = flame / LOOP_FLAME;
  return { x: x - size / 2, y: y - size * LOOP_BASE, width: size, height: size };
}

/**
 * Where the fire room draws its lit flame on the window, the scene risen behind the panel that
 * asks you to pull up a log (as it opens on a fire friends sit by).
 */
export const roomFlameBox = (width: number, height: number): Box =>
  flameSquare(FIRE_AT.x * width, FIRE_AT.y * height - SCENE_LIFT, width * FLAME.lit);

/**
 * The flight from the flame on the farm (its base at `ring`, `flame` wide, in window points) to the
 * room's, which covers the window.
 */
/** The size of the room's flame loop on a window this wide (as the fire room draws it). */
export const roomFlameSize = (windowWidth: number): number =>
  Math.round((windowWidth * FLAME.lit) / LOOP_FLAME);

export function fireFlight(
  ring: { readonly x: number; readonly y: number; readonly flame: number },
  window: { readonly width: number; readonly height: number },
): FlightOptions {
  const from = flameSquare(ring.x, ring.y, ring.flame);
  const size = roomFlameSize(window.width);
  return {
    from,
    to: roomFlameBox(window.width, window.height),
    sprite: { fire: size },
    fromWidth: from.width,
    toWidth: size,
    arc: 30,
    durationMs: timing('fire', 'in'),
  };
}
