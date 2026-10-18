import type { FarmId, PersonId } from '@kithfield/contracts';

/*
 * What the app names the images it renders for the surfaces, beyond `SurfaceFarm.images`, and
 * the rules a widget works its picture out by. The extensions' side is
 * `targets/_shared/SurfaceNames.swift`; a test checks the two agree.
 */

/** The widget scene's homes, in the order of the bits of a lit mask. */
export const HOMES = ['rabbit', 'hedgehog', 'frog', 'mole', 'sheep', 'owl'] as const;

/**
 * A short stable tag for an id: FNV-1a over its UTF-8, 64 bits, the top 52 in base 36. The server
 * tags push keys the same way (`apps/api/src/push/catalogue.ts`), so it can name a critter's still.
 */
export function tag(id: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(id)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return (hash >> 12n).toString(36);
}

/** The homes lit, as bits. Kinds without a home in the scene light nothing. */
export function litMask(lit: Iterable<string>): number {
  let mask = 0;
  for (const kind of lit) {
    const at = (HOMES as readonly string[]).indexOf(kind);
    if (at >= 0) mask |= 1 << at;
  }
  return mask;
}

export const imageNames = {
  /** `SurfaceFarm.images`: the farm's still, by day and by night. */
  farmDay: (farm: FarmId) => `farm-${tag(farm)}-day.png`,
  farmNight: (farm: FarmId) => `farm-${tag(farm)}-night.png`,
  /** The medium widget's night farm with these windows lit. */
  medium: (farm: FarmId, mask: number) => `widget-${tag(farm)}-${mask}.png`,
  /** The large widget's night farm with these windows lit. */
  large: (farm: FarmId, mask: number) => `widgetl-${tag(farm)}-${mask}.png`,
  /** The medium widget while the fire is lit. */
  mediumFire: (farm: FarmId) => `widgetfire-${tag(farm)}.png`,
  /** The small fire: the small widget and the fire's round icon. */
  smallFire: (season: string) => `firesmall-${season}.png`,
  /** The fire room's still: the fire's Live Activity on the Lock Screen. */
  fireRoom: (season: string) => `fireroom-${season}.png`,
  /** The path to a plan without its walkers: the plan's Live Activity. */
  walk: (season: string) => `walk-${season}.png`,
  /** A sprouted seed: a plan push's picture. */
  seed: 'seed.png',
  /** A person's critter in the avatar's frame. */
  critter: (person: PersonId) => `critter-${tag(person)}.png`,
  /** A person's critter whole, walking along the plan's path. */
  walker: (person: PersonId) => `walker-${tag(person)}.png`,
  appIcon: 'appicon.png',
  icon: (name: string) => `icon-${name}.png`,
} as const;
