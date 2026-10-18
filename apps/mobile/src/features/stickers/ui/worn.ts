import type { Critter } from '@kithfield/contracts';
import type { StringKey, Translate } from '@kithfield/i18n';

/** Each accessory's name, as Make them yours writes it. */
const ACCESSORY_NAMES = {
  beanie: 'onboardingCritters.accessory.beanie',
  straw: 'onboardingCritters.accessory.straw',
  scarf: 'onboardingCritters.accessory.scarf',
  bow: 'onboardingCritters.accessory.bow',
  flower: 'onboardingCritters.accessory.flower',
  glasses: 'onboardingCritters.accessory.glasses',
  party: 'onboardingCritters.accessory.party',
  satchel: 'onboardingCritters.accessory.satchel',
} as const satisfies Record<string, StringKey>;

const isAccessory = (name: string): name is keyof typeof ACCESSORY_NAMES => name in ACCESSORY_NAMES;

/** The colour each accessory is drawn in, in words (`ACCESSORY_COLOUR`); the rest have none. */
const ACCESSORY_COLOURS = {
  beanie: 'stickers.colour.beanie',
  straw: 'stickers.colour.straw',
  scarf: 'stickers.colour.scarf',
  bow: 'stickers.colour.bow',
  flower: 'stickers.colour.flower',
  party: 'stickers.colour.party',
} as const satisfies Partial<Record<keyof typeof ACCESSORY_NAMES, StringKey>>;

const hasColour = (name: string): name is keyof typeof ACCESSORY_COLOURS =>
  name in ACCESSORY_COLOURS;

/**
 * What a critter wears, in words for "wearing your …" ("the green scarf" with `colour`): null
 * when it wears nothing.
 */
export function wornName(t: Translate, critter: Critter | null, colour = false): string | null {
  if (critter === null) return null;
  if (critter.outfit) return t('stickers.wornOutfit');
  const accessory = critter.accessory;
  if (!accessory) return null;
  if (!isAccessory(accessory)) return t('stickers.wornOutfit');
  const item = t(ACCESSORY_NAMES[accessory]).toLocaleLowerCase();
  return colour && hasColour(accessory)
    ? t('stickers.wornColour', { item, colour: t(ACCESSORY_COLOURS[accessory]) })
    : item;
}
