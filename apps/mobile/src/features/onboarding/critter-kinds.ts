import type { Species } from '@kithfield/contracts';

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
