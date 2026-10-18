import type { Critter } from '@kithfield/contracts';
import { nightMatrix } from '@kithfield/theme';

import type { ArtStore } from '../../ui/art/art-store';
import { bakeCritter, type CritterPoses } from '../farm/farm-bake';
import { shadeAt, SLOTS } from './seats';

/*
 * The fire room's drawings, made once on the JS thread and then only moved: the campfire scene as
 * a still (the scene relights itself every frame, so it can't be layered), the fire as its own
 * loop, and each critter's poses from its cached layers.
 */

/** The fire's state as the scene draws it. */
export type FireState = 'unlit' | 'lit' | 'quiet';

/** The still behind everything: the fire scene with no critters, at the renderer's still moment. */
export const backdropRequest = (
  width: number,
  height: number,
  season: string,
  state: FireState,
  /** The moon lower in the sky, for while the scene sits lifted behind a tall panel. */
  alt: boolean,
) => ({
  scene: 'fire2',
  width,
  height,
  attrs: {
    season,
    items: '',
    ...(alt ? { alt: true } : {}),
    ...(state === 'lit' ? {} : { state }),
  },
});

/** The scene's own flame: 0.17 of its width alight, 0.09 settling to embers. */
export const FLAME = { lit: 0.17, quiet: 0.09 } as const;
/** `fireLoop` draws a flame 0.6 of its square, its base 0.9 of the way down. */
export const LOOP_FLAME = 0.6;
export const LOOP_BASE = 0.9;

/** A seated critter's poses, facing the fire and facing away (walking the path). */
export interface SeatPoses {
  readonly toward: CritterPoses;
  readonly away: CritterPoses;
  readonly dozing: CritterPoses;
  /** Its size in points (about the body's height). */
  readonly size: number;
}

/** The poses a critter needs at a seat: the seat's way, the other way, and asleep. */
export function bakeSeat(
  store: ArtStore,
  critter: Critter,
  seat: number,
  width: number,
): SeatPoses {
  const slot = SLOTS[seat] ?? SLOTS[0];
  const size = Math.round(width * (slot?.size ?? 0.17));
  const dir = slot?.dir ?? 1;
  return {
    toward: bakeCritter(store, critter, size, dir, false),
    away: bakeCritter(store, critter, size, dir === 1 ? -1 : 1, false),
    dozing: bakeCritter(store, critter, size, dir, true),
    size,
  };
}

/**
 * The scene's night pass over a critter at a seat, as a colour matrix: the dark wash the
 * firelight leaves there (the scene darkens at 0.9; the theme's night matrix at its own 0.82).
 */
export function seatShade(seat: number, width: number, height: number): number[] {
  const slot = SLOTS[seat] ?? SLOTS[0];
  const shade = shadeAt(slot?.x ?? 0.5, (slot?.y ?? 0.6) - 0.04, width, height);
  return nightMatrix((shade * 0.9) / 0.82);
}
