import type { CritterLook } from '@kithfield/art';
import type { Critter, Species } from '@kithfield/contracts';

export {
  CRITTERS,
  DEFAULT_COAT,
  SHAPES,
  type Coat,
  type CoatName,
  type CritterKind,
  type Shape,
} from './critter-kinds';
import { CRITTERS, DEFAULT_COAT, type CritterKind, type Shape } from './critter-kinds';

/** The markings, `none` first (Make them yours, Markings). */
export const MARKS = ['none', 'patch', 'spots', 'freckles', 'blaze'] as const;
export type Mark = (typeof MARKS)[number];

/** The accessories, `none` first, with the colour each is drawn in (Make them yours, Accessory). */
export const ACCESSORIES = [
  'none',
  'beanie',
  'straw',
  'scarf',
  'bow',
  'flower',
  'glasses',
  'party',
  'satchel',
] as const;
export type Accessory = (typeof ACCESSORIES)[number];

const ACCESSORY_COLOUR: Partial<Record<Accessory, string>> = {
  beanie: '#6f8faa',
  straw: '#c9543e',
  scarf: '#5e7f4a',
  bow: '#d4704e',
  flower: '#f0b3b6',
  party: '#e8b44e',
};

/** What the person has picked so far. */
export interface CritterChoice {
  readonly species: Species;
  readonly coat: string;
  readonly mark: Mark;
  readonly accessory: Accessory;
}

/** The design's opening pick: a fox in its own coat. */
export const FIRST_CHOICE: CritterChoice = {
  species: 'fox',
  coat: DEFAULT_COAT,
  mark: 'none',
  accessory: 'none',
};

export function kindOf(species: Species): CritterKind {
  return CRITTERS.find((c) => c.species === species) ?? (CRITTERS[0] as CritterKind);
}

/** The critters a shape filter shows (`all` shows every one). */
export function crittersShaped(shape: Shape | 'all'): readonly CritterKind[] {
  return shape === 'all' ? CRITTERS : CRITTERS.filter((c) => c.shape === shape);
}

/** Picking another critter starts it in its own coat (the design resets the coat). */
export function pickSpecies(choice: CritterChoice, species: Species): CritterChoice {
  return species === choice.species ? choice : { ...choice, species, coat: DEFAULT_COAT };
}

/** The choice as the API keeps it. */
export function critterOf(choice: CritterChoice): Critter {
  return {
    species: choice.species,
    coat: choice.coat,
    mark: choice.mark === 'none' ? null : choice.mark,
    accessory: choice.accessory === 'none' ? null : choice.accessory,
    outfit: null,
    outfitColor: null,
    companion: null,
    cottage: null,
  };
}

/** A worn item for the art, in its colour. */
function wearable(name: string, color: string | null | undefined) {
  return color ? { name, color } : { name };
}

/** How the art draws a critter the API describes: each slot as its own cached layer. */
export function lookOf(critter: Critter): CritterLook {
  const accessoryColour = ACCESSORY_COLOUR[critter.accessory as Accessory];
  return {
    ...(critter.coat === DEFAULT_COAT ? {} : { coat: critter.coat }),
    ...(critter.mark ? { mark: critter.mark } : {}),
    ...(critter.outfit ? { outfit: wearable(critter.outfit, critter.outfitColor) } : {}),
    ...(critter.accessory ? { accessory: wearable(critter.accessory, accessoryColour) } : {}),
  };
}

/** The scene attributes (`stage`, `avatar`) that draw a choice, as the design's renderer reads them. */
export function lookAttrs(choice: CritterChoice): Record<string, string> {
  const colour = ACCESSORY_COLOUR[choice.accessory];
  return {
    kind: choice.species,
    ...(choice.coat === DEFAULT_COAT ? {} : { coat: choice.coat }),
    ...(choice.mark === 'none' ? {} : { mark: choice.mark }),
    ...(choice.accessory === 'none' ? {} : { outfit: choice.accessory }),
    ...(colour ? { ocolor: colour } : {}),
  };
}

/** A farmmate the picked critter is measured against: the inviter has a name, others don't. */
export interface Farmmate {
  readonly critter: Critter;
  readonly name: string | null;
}

/**
 * What the picker says about the farm it is moving into (the twin check): `twin` when
 * someone there looks exactly like this choice (critter, coat, marking and accessory), `alike`
 * when someone is the same critter but easy to tell apart, otherwise nothing.
 */
export function farmmateCheck(
  choice: CritterChoice,
  farmmates: readonly Farmmate[],
): { readonly kind: 'twin' | 'alike'; readonly farmmate: Farmmate } | null {
  const mine = critterOf(choice);
  const same = farmmates.filter(({ critter }) => critter.species === mine.species);
  const twin = same.find(
    ({ critter }) =>
      critter.coat === mine.coat &&
      critter.mark === mine.mark &&
      critter.accessory === mine.accessory &&
      critter.outfit === null,
  );
  if (twin) return { kind: 'twin', farmmate: twin };
  // Prefer the one with a name to talk about.
  const alike = same.find((f) => f.name !== null) ?? same[0];
  return alike ? { kind: 'alike', farmmate: alike } : null;
}
