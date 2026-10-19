import type { FarmId } from '@kithfield/contracts';

import { timing, travelIds, type Box, type FlightOptions } from '../../ui/travel';
import { FLAME, LOOP_BASE, LOOP_FLAME } from './fire-art';
import { FIRE_AT } from './seats';

/*
 * The fire's way in (signature motion): the farm zooms toward its fire ring and its flame flies
 * into the fire room's, which grows to the room's size as the room fades up.
 */

/** The square `fireLoop` draws a flame `flame` wide in, its base at (`x`, `y`). */
export function flameSquare(x: number, y: number, flame: number): Box {
  const size = flame / LOOP_FLAME;
  return { x: x - size / 2, y: y - size * LOOP_BASE, width: size, height: size };
}

/** Where the fire room draws its lit flame, in the scene's points. */
export const roomFlameBox = (width: number, height: number): Box =>
  flameSquare(FIRE_AT.x * width, FIRE_AT.y * height, width * FLAME.lit);

/**
 * The flight from the flame on the farm (its base at `ring`, `flame` wide, in window points) into
 * the room's, for a room as wide as the window.
 */
/** The size of the room's flame loop on a window this wide (as the fire room draws it). */
export const roomFlameSize = (windowWidth: number): number =>
  Math.round((windowWidth * FLAME.lit) / LOOP_FLAME);

export function fireFlight(
  farm: FarmId,
  ring: { readonly x: number; readonly y: number; readonly flame: number },
  windowWidth: number,
): FlightOptions {
  const from = flameSquare(ring.x, ring.y, ring.flame);
  const size = roomFlameSize(windowWidth);
  return {
    from,
    to: travelIds.fireFlame(farm),
    sprite: { fire: size },
    fromWidth: from.width,
    toWidth: size,
    arc: 30,
    durationMs: timing('fire', 'in'),
  };
}
