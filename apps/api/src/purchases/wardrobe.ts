import type { Critter, CritterSlot } from '@kithfield/contracts';

import { registerWardrobeCheck } from '../auth';
import { catalogItem } from './catalog';
import { unowned } from './entitlements';

/*
 * What a critter may wear: anything every critter starts with (the coats and accessories onboarding
 * offers), and from Rocco's cart only what the person owns. Checked when the profile changes, and
 * only for what is newly put on, so changing your name never asks about what you already wear.
 */

/** The slots a shop item dresses, as the `Critter` keys they fill. */
const SLOTS = ['coat', 'accessory', 'outfit', 'companion', 'cottage'] as const satisfies readonly (
  CritterSlot | keyof Critter
)[];

/** The accessories onboarding offers every critter (`Make them yours`). */
const STARTER_ACCESSORIES: ReadonlySet<string> = new Set([
  'beanie',
  'straw',
  'scarf',
  'bow',
  'flower',
  'glasses',
  'party',
  'satchel',
]);

/** The shop items a critter wears that it didn't wear before. */
export const newlyWorn = (critter: Critter, before: Critter | null): string[] =>
  SLOTS.flatMap((slot) => {
    const value = critter[slot];
    if (value === null || value === before?.[slot]) return [];
    if (slot === 'accessory' && STARTER_ACCESSORIES.has(value)) return [];
    const item = catalogItem(value);
    return item !== null && item.slot === slot ? [value] : [];
  });

registerWardrobeCheck(
  async (env, person, critter, before) =>
    (await unowned(env.DB, person, newlyWorn(critter, before))).length === 0,
);
