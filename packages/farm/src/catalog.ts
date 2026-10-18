import {
  type CareFamily,
  type Hemisphere,
  PLANT_STAGES,
  type RareVariant,
  type Season,
  type Weather,
} from '@kithfield/contracts';

/*
 * The plant catalogue. Every id is also the plant's art name: `scene="plant" name=<id>` in the
 * art renderer. Display names come from the i18n catalogue, keyed by id.
 */

export const SEASONS = [
  'spring',
  'summer',
  'autumn',
  'winter',
] as const satisfies readonly Season[];

/** The six families in the order every list shows them. */
export const FAMILIES = [
  'dew',
  'words',
  'pictures',
  'voices',
  'gestures',
  'gatherings',
] as const satisfies readonly CareFamily[];

/** One plant per family per season: spring, summer, autumn, winter. */
export const FAMILY_PLANTS = {
  dew: ['clover', 'chamomile', 'marigold', 'snowdrop'],
  words: ['tulip', 'cornflower', 'aster', 'jasmine'],
  pictures: ['daffodil', 'sunflower', 'chrysanthemum', 'camellia'],
  voices: ['sweetpea', 'lavender', 'heather', 'holly'],
  gestures: ['bluebell', 'poppy', 'apple', 'moonflower'],
  gatherings: ['blossom', 'strawberry', 'pumpkin', 'hellebore'],
} as const satisfies Record<CareFamily, readonly [string, string, string, string]>;

export type FamilyPlantId = (typeof FAMILY_PLANTS)[CareFamily][number];

/** A visit's porch pot follows the season. */
export const PORCH_POT = {
  spring: 'forgetmenot',
  summer: 'nasturtium',
  autumn: 'cosmos',
  winter: 'paperwhite',
} as const satisfies Record<Season, string>;

export type PorchPotId = (typeof PORCH_POT)[Season];

/**
 * The signature crop pool: one fruit per farm, named after the farm ("the Thursday plum"),
 * grown from all care combined and tradeable on visits. `fruit` is the farm scene's `fruit`
 * attribute; `plant` is its field-guide drawing.
 */
export const SIGNATURE_POOL = [
  { id: 'plum', fruit: 'plum', plant: 'plum' },
  { id: 'persimmon', fruit: 'persimmon', plant: 'persimmon' },
  { id: 'lemon', fruit: 'lemon', plant: 'lemon' },
  { id: 'fig', fruit: 'fig', plant: 'fig' },
] as const;

export type SignatureId = (typeof SIGNATURE_POOL)[number]['id'];

export type CatalogPlantId = FamilyPlantId | PorchPotId | SignatureId | 'rose';

export interface PlantEntry {
  readonly id: CatalogPlantId;
  /** A family plant, the birthday rose, a signature crop, or a porch pot plant. */
  readonly role: 'family' | 'rose' | 'signature' | 'pot';
  readonly family: CareFamily | null;
  /** Null for plants that grow all year. */
  readonly season: Season | null;
  /** Drawn in the terracotta pot (the art's `pot` attribute). */
  readonly inPot: boolean;
  /** Can turn rare when it blooms; porch pot blooms press into the visit scrapbook only. */
  readonly canBeRare: boolean;
}

const familyEntries: PlantEntry[] = FAMILIES.flatMap((family) =>
  FAMILY_PLANTS[family].map((id, i) => ({
    id,
    role: 'family' as const,
    family,
    season: SEASONS[i] ?? null,
    inPot: false,
    canBeRare: true,
  })),
);

const potEntries: PlantEntry[] = SEASONS.map((season) => ({
  id: PORCH_POT[season],
  role: 'pot' as const,
  family: null,
  season,
  inPot: true,
  canBeRare: false,
}));

const signatureEntries: PlantEntry[] = SIGNATURE_POOL.map(({ id }) => ({
  id,
  role: 'signature' as const,
  family: null,
  season: null,
  inPot: false,
  canBeRare: true,
}));

/** The birthday rose: blooms over a member's cottage on their birthday. */
export const ROSE: PlantEntry = {
  id: 'rose',
  role: 'rose',
  family: null,
  season: null,
  inPot: false,
  canBeRare: false,
};

/** Every plant: 24 family plants, the rose, the signature pool and the 4 porch pot plants. */
export const PLANTS: readonly PlantEntry[] = [
  ...familyEntries,
  ROSE,
  ...signatureEntries,
  ...potEntries,
];

export const PLANT_BY_ID: ReadonlyMap<CatalogPlantId, PlantEntry> = new Map(
  PLANTS.map((p) => [p.id, p]),
);

/** Stage names by index 0–4; the art draws `stage=<index>`, and sleepy as `state="sleepy"`. */
export const STAGES = PLANT_STAGES;

/** First month (1–12) of each season; each lasts three months. Meteorological, by hemisphere. */
export const SEASON_START_MONTH = {
  north: { spring: 3, summer: 6, autumn: 9, winter: 12 },
  south: { spring: 9, summer: 12, autumn: 3, winter: 6 },
} as const satisfies Record<Hemisphere, Record<Season, number>>;

/** A plant naps after this many days without a tend of its family. */
export const SLEEPY_AFTER_DAYS = {
  spring: 7,
  summer: 7,
  autumn: 7,
  winter: 14,
} as const satisfies Record<Season, number>;

/**
 * Rare variants: the weather that brings each and the art state that draws it. `sharedRain` says
 * whether a shared rain day (3+ members on the farm within 10 minutes) also counts as that
 * weather; only rain-kissed does. Shared rain raises the chance for every variant all the same.
 */
export const RARE_VARIANTS = [
  { id: 'rain_kissed', weather: 'rain', sharedRain: true, artState: 'rain' },
  { id: 'frost_lace', weather: 'frost', sharedRain: false, artState: 'frost' },
  { id: 'sun_gold', weather: 'heat', sharedRain: false, artState: 'gold' },
] as const satisfies readonly {
  id: RareVariant;
  weather: Weather;
  sharedRain: boolean;
  artState: string;
}[];

/** The plant a family grows in a season. */
export const plantFor = (family: CareFamily, season: Season): FamilyPlantId =>
  FAMILY_PLANTS[family][SEASONS.indexOf(season)] ?? FAMILY_PLANTS[family][0];
