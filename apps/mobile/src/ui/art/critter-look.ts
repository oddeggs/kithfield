import type { CritterLook } from '@kithfield/art';
import type { Critter } from '@kithfield/contracts';

/*
 * How the art draws a critter the contracts describe, everywhere a critter is drawn: avatars, the
 * farm, chat headers, cards and scenes.
 */

/** The coat a critter is drawn in when none was picked: the art's own, so it isn't named. */
export const DEFAULT_COAT = 'default';

/** The colour each accessory is drawn in (Make them yours, Accessory); the rest keep their own. */
export const ACCESSORY_COLOUR: Readonly<Record<string, string>> = {
  beanie: '#6f8faa',
  straw: '#c9543e',
  scarf: '#5e7f4a',
  bow: '#d4704e',
  flower: '#f0b3b6',
  party: '#e8b44e',
};

/** A worn item for the art, in its colour. */
function wearable(name: string, color: string | null | undefined) {
  return color ? { name, color } : { name };
}

/** How the art draws a critter: each slot as its own cached layer. */
export function lookOf(critter: Critter): CritterLook {
  const accessory = critter.accessory;
  return {
    ...(critter.coat === DEFAULT_COAT ? {} : { coat: critter.coat }),
    ...(critter.mark ? { mark: critter.mark } : {}),
    ...(critter.outfit ? { outfit: wearable(critter.outfit, critter.outfitColor) } : {}),
    ...(accessory ? { accessory: wearable(accessory, ACCESSORY_COLOUR[accessory]) } : {}),
  };
}

/** What a scene draws on the critter: it has one slot, the outfit, else the accessory. */
function worn(critter: Critter): { name: string; colour: string | null } | null {
  if (critter.outfit) return { name: critter.outfit, colour: critter.outfitColor };
  if (critter.accessory) {
    return { name: critter.accessory, colour: ACCESSORY_COLOUR[critter.accessory] ?? null };
  }
  return null;
}

/** A critter as a scene's attributes (`stage`, `burrow`, `sticker`): kind, coat, mark, what it wears. */
export function sceneLook(critter: Critter): Record<string, string> {
  const item = worn(critter);
  return {
    kind: critter.species,
    ...(critter.coat === DEFAULT_COAT ? {} : { coat: critter.coat }),
    ...(critter.mark ? { mark: critter.mark } : {}),
    ...(item ? { outfit: item.name } : {}),
    ...(item?.colour ? { ocolor: item.colour } : {}),
  };
}

/** A critter in a scene's `cast` attribute: `kind/coat/mark/outfit/ocolor/state` (`z` asleep). */
export function castOf(critter: Critter, state = ''): string {
  const item = worn(critter);
  return [
    critter.species,
    critter.coat === DEFAULT_COAT ? '' : critter.coat,
    critter.mark ?? '',
    item?.name ?? '',
    item?.colour ?? '',
    state,
  ].join('/');
}
