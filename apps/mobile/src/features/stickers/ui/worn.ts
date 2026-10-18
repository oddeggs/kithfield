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

/** What a critter wears, in words for "wearing your …": null when it wears nothing. */
export function wornName(t: Translate, critter: Critter | null): string | null {
  if (critter === null) return null;
  if (critter.outfit) return t('stickers.wornOutfit');
  const accessory = critter.accessory;
  if (!accessory) return null;
  return isAccessory(accessory)
    ? t(ACCESSORY_NAMES[accessory]).toLocaleLowerCase()
    : t('stickers.wornOutfit');
}
