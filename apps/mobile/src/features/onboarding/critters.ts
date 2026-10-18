import type { CritterLook } from '@kithfield/art';
import type { Critter, Species } from '@kithfield/contracts';

/** The picker's filters (`03 Onboarding`, the critter picker). */
export const SHAPES = ['tall', 'long', 'little', 'round'] as const;
export type Shape = (typeof SHAPES)[number];

/** The coat every critter is born in; the art draws the critter's own colours for it. */
export const DEFAULT_COAT = 'default';

/** The coats' names in the catalogue (`onboardingCritters.coat.<name>`). */
export type CoatName =
  | 'arctic'
  | 'ash'
  | 'barn'
  | 'black'
  | 'brown'
  | 'cinnamon'
  | 'cloud'
  | 'cocoa'
  | 'cream'
  | 'duckling'
  | 'dusk'
  | 'ginger'
  | 'grey'
  | 'hazel'
  | 'honey'
  | 'mallard'
  | 'moss'
  | 'oat'
  | 'olive'
  | 'pale'
  | 'pebble'
  | 'polar'
  | 'river'
  | 'rose'
  | 'russet'
  | 'sandy'
  | 'sea'
  | 'silver'
  | 'sky'
  | 'slate'
  | 'smoky'
  | 'snow'
  | 'snowy'
  | 'sunny'
  | 'tawny'
  | 'toffee'
  | 'white';

export interface Coat {
  /** The art's coat name, or `DEFAULT_COAT`. */
  readonly id: string;
  /** Its name in the catalogue (`onboardingCritters.coat.<label>`). */
  readonly label: CoatName;
  /** The swatch the coat row shows. */
  readonly swatch: string;
}

export interface CritterKind {
  readonly species: Species;
  readonly shape: Shape;
  /** The tile and stage behind the critter. */
  readonly tint: string;
  readonly coats: readonly Coat[];
}

const coats = (...list: readonly (readonly [string, CoatName, string])[]): readonly Coat[] =>
  list.map(([id, label, swatch]) => ({ id, label, swatch }));

/** The sixteen critters in the picker's order, with their coats (`03 Onboarding`). */
export const CRITTERS: readonly CritterKind[] = [
  {
    species: 'rabbit',
    shape: 'tall',
    tint: '#F2E0D4',
    coats: coats(
      [DEFAULT_COAT, 'cream', '#fbf5ea'],
      ['cocoa', 'cocoa', '#dcb995'],
      ['grey', 'grey', '#dedad5'],
      ['honey', 'honey', '#f1d6a2'],
    ),
  },
  {
    species: 'hedgehog',
    shape: 'long',
    tint: '#EFDFCA',
    coats: coats(
      [DEFAULT_COAT, 'hazel', '#dcb88f'],
      ['ash', 'ash', '#ddd3c6'],
      ['ginger', 'ginger', '#ebbf90'],
    ),
  },
  {
    species: 'frog',
    shape: 'little',
    tint: '#E2EAD0',
    coats: coats(
      [DEFAULT_COAT, 'moss', '#d4e2ad'],
      ['sky', 'sky', '#cfe0e6'],
      ['sunny', 'sunny', '#f0e2a6'],
      ['rose', 'rose', '#f2d3c8'],
    ),
  },
  {
    species: 'mole',
    shape: 'round',
    tint: '#E6DDE4',
    coats: coats(
      [DEFAULT_COAT, 'dusk', '#cbbdc8'],
      ['cocoa', 'cocoa', '#ccb29c'],
      ['slate', 'slate', '#bfc9d0'],
    ),
  },
  {
    species: 'sheep',
    shape: 'round',
    tint: '#ECE6DA',
    coats: coats(
      [DEFAULT_COAT, 'cloud', '#fdf8ef'],
      ['oat', 'oat', '#f1e4ca'],
      ['cocoa', 'cocoa', '#ad9482'],
    ),
  },
  {
    species: 'owl',
    shape: 'tall',
    tint: '#EFE2C8',
    coats: coats(
      [DEFAULT_COAT, 'tawny', '#e6cfa4'],
      ['snowy', 'snowy', '#f3efe7'],
      ['barn', 'barn', '#f1dcb9'],
    ),
  },
  {
    species: 'fox',
    shape: 'tall',
    tint: '#F3DCC8',
    coats: coats(
      [DEFAULT_COAT, 'russet', '#e8955a'],
      ['arctic', 'arctic', '#f1ede6'],
      ['silver', 'silver', '#b8b4b0'],
    ),
  },
  {
    species: 'duck',
    shape: 'little',
    tint: '#F3ECDC',
    coats: coats(
      [DEFAULT_COAT, 'white', '#fdf8ee'],
      ['duckling', 'duckling', '#f4dc86'],
      ['mallard', 'mallard', '#3f6f55'],
    ),
  },
  {
    species: 'tortoise',
    shape: 'long',
    tint: '#E8E6D2',
    coats: coats(
      [DEFAULT_COAT, 'olive', '#a8b06a'],
      ['sunny', 'sunny', '#d7b45a'],
      ['moss', 'moss', '#7f9a6a'],
    ),
  },
  {
    species: 'badger',
    shape: 'long',
    tint: '#E4E3E3',
    coats: coats(
      [DEFAULT_COAT, 'grey', '#a3a2a6'],
      ['honey', 'honey', '#c9a26e'],
      ['smoky', 'smoky', '#76737a'],
    ),
  },
  {
    species: 'mouse',
    shape: 'little',
    tint: '#ECE6DF',
    coats: coats(
      [DEFAULT_COAT, 'pebble', '#d9cfc4'],
      ['snow', 'snow', '#f6f2ec'],
      ['brown', 'brown', '#b08a68'],
    ),
  },
  {
    species: 'capybara',
    shape: 'long',
    tint: '#ECDCCB',
    coats: coats(
      [DEFAULT_COAT, 'toffee', '#b98a5e'],
      ['dusk', 'dusk', '#8f6a4a'],
      ['sandy', 'sandy', '#d6b08a'],
    ),
  },
  {
    species: 'raccoon',
    shape: 'round',
    tint: '#E6E2DE',
    coats: coats(
      [DEFAULT_COAT, 'grey', '#a8a3a0'],
      ['cinnamon', 'cinnamon', '#c9a383'],
      ['pale', 'pale', '#d4d0cc'],
    ),
  },
  {
    species: 'otter',
    shape: 'tall',
    tint: '#EADCCD',
    coats: coats(
      [DEFAULT_COAT, 'river', '#8a6448'],
      ['sea', 'sea', '#6e5a4e'],
      ['sandy', 'sandy', '#b08a68'],
    ),
  },
  {
    species: 'cat',
    shape: 'round',
    tint: '#F4E0C8',
    coats: coats(
      [DEFAULT_COAT, 'ginger', '#eeb070'],
      ['black', 'black', '#3f3836'],
      ['grey', 'grey', '#b9b5b2'],
      ['cream', 'cream', '#f3e6cf'],
    ),
  },
  {
    species: 'bear',
    shape: 'round',
    tint: '#ECDCCB',
    coats: coats(
      [DEFAULT_COAT, 'brown', '#a87a52'],
      ['honey', 'honey', '#c99a5e'],
      ['polar', 'polar', '#f3efe6'],
      ['cinnamon', 'cinnamon', '#b8683a'],
    ),
  },
];

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
