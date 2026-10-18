import type { PersonId, Species } from '@kithfield/contracts';

/*
 * Where things stand on the farm scene, as fractions of its width (x, sizes) and height (y). The
 * houses, the home spots and the landmarks are where the art's `farm` scene draws them; the field
 * spots give room for every critter a farm can hold (24) without covering the pond, the vegetable
 * patch, the path or the fire ring.
 */

export interface Spot {
  readonly x: number;
  readonly y: number;
  /** The critter's size as a fraction of the scene's width. */
  readonly size: number;
  /** 1 faces right, -1 faces left. */
  readonly dir: 1 | -1;
}

/** The scene's five cottages, by the name the art gives each (its roof colour and `lit` key). */
export const HOUSE_KEYS = ['rabbit', 'hedgehog', 'frog', 'mole', 'sheep'] as const;
export type HouseKey = (typeof HOUSE_KEYS)[number];

/** Each cottage's middle and base, and its width, as the scene's hills set them. */
export const HOUSES: Readonly<Record<HouseKey, { x: number; y: number; size: number }>> = {
  rabbit: { x: 0.15, y: 0.311, size: 0.11 },
  hedgehog: { x: 0.47, y: 0.311, size: 0.12 },
  frog: { x: 0.74, y: 0.293, size: 0.1 },
  mole: { x: 0.3, y: 0.402, size: 0.13 },
  sheep: { x: 0.6, y: 0.387, size: 0.12 },
};

/** Where the scene stands its own five critters, each by its cottage's name. */
export const HOME_SPOTS: Readonly<Record<HouseKey, Spot>> = {
  sheep: { x: 0.13, y: 0.63, size: 0.15, dir: 1 },
  mole: { x: 0.47, y: 0.645, size: 0.12, dir: 1 },
  frog: { x: 0.36, y: 0.825, size: 0.12, dir: 1 },
  rabbit: { x: 0.6, y: 0.8, size: 0.13, dir: -1 },
  hedgehog: { x: 0.83, y: 0.885, size: 0.14, dir: -1 },
};

/** The home spots in the order they are handed out once the matching ones are taken. */
const HOME_ORDER: readonly HouseKey[] = ['sheep', 'mole', 'frog', 'rabbit', 'hedgehog'];

/** Nineteen more spots in the field, nearest the cottages first. */
export const FIELD_SPOTS: readonly Spot[] = [
  { x: 0.29, y: 0.605, size: 0.1, dir: -1 },
  { x: 0.64, y: 0.6, size: 0.1, dir: 1 },
  { x: 0.76, y: 0.615, size: 0.1, dir: -1 },
  { x: 0.24, y: 0.69, size: 0.1, dir: 1 },
  { x: 0.4, y: 0.735, size: 0.11, dir: -1 },
  { x: 0.8, y: 0.775, size: 0.11, dir: -1 },
  { x: 0.95, y: 0.71, size: 0.1, dir: -1 },
  { x: 0.06, y: 0.705, size: 0.1, dir: 1 },
  { x: 0.7, y: 0.85, size: 0.12, dir: 1 },
  { x: 0.93, y: 0.82, size: 0.11, dir: -1 },
  { x: 0.33, y: 0.905, size: 0.12, dir: -1 },
  { x: 0.08, y: 0.885, size: 0.12, dir: 1 },
  { x: 0.6, y: 0.915, size: 0.12, dir: 1 },
  { x: 0.95, y: 0.915, size: 0.12, dir: -1 },
  { x: 0.57, y: 0.68, size: 0.1, dir: 1 },
  { x: 0.42, y: 0.865, size: 0.12, dir: 1 },
  { x: 0.2, y: 0.6, size: 0.09, dir: 1 },
  { x: 0.86, y: 0.67, size: 0.1, dir: -1 },
  { x: 0.48, y: 0.94, size: 0.12, dir: -1 },
];

/** The places on the farm that open something when tapped. */
export const LANDMARKS = {
  /** The fire ring (the fire room). */
  fire: { x: 0.2, y: 0.93, rx: 0.07, ry: 0.035 },
  /** The vegetable patch (the seed bed). */
  patch: { x: 0.69, y: 0.69, rx: 0.13, ry: 0.045 },
  /** The little flag of a plan, by the path. */
  stake: { x: 0.36, y: 0.675, rx: 0.04, ry: 0.05 },
} as const;

export interface Resident {
  readonly person: PersonId;
  readonly species: Species;
  readonly joinedAt: number;
}

export interface PlacedCritter {
  readonly person: PersonId;
  readonly spot: Spot;
  /** Their cottage, while one of the scene's five is free. */
  readonly house: HouseKey | null;
}

export interface PlacedHouse {
  readonly key: HouseKey;
  readonly person: PersonId;
  /** Someone who has gone wandering: their cottage dozes. */
  readonly former: boolean;
}

export interface FarmPlacement {
  /** Back to front, so nearer critters draw over farther ones. */
  readonly critters: readonly PlacedCritter[];
  readonly houses: readonly PlacedHouse[];
}

/**
 * Who stands where. Cottages and spots are handed out over everyone who has lived here, members
 * and former members together, in join order, so someone leaving moves nobody and takes no
 * cottage away: theirs dozes. A critter of a cottage's own kind takes that cottage and its spot,
 * so a farm of the scene's own five looks as the design draws it; everyone else takes the next
 * free cottage and spot. The scene has five cottages: past five, critters live in the field
 * without one. When every spot is taken, a newcomer stands where a former member stood.
 */
export function placeFarm(
  members: readonly Resident[],
  former: readonly Resident[] = [],
): FarmPlacement {
  const gone = new Set(former.map((f) => f.person));
  const everyone = [...members, ...former].sort(
    (a, b) => a.joinedAt - b.joinedAt || (a.person < b.person ? -1 : 1),
  );
  const freeHouses = new Set<HouseKey>(HOUSE_KEYS);
  const freeHomes = new Set<HouseKey>(HOUSE_KEYS);
  const houseOf = new Map<PersonId, HouseKey>();
  const spotOf = new Map<PersonId, Spot>();
  const isHouse = (s: string): s is HouseKey => (HOUSE_KEYS as readonly string[]).includes(s);

  for (const r of everyone) {
    if (isHouse(r.species) && freeHouses.has(r.species) && freeHomes.has(r.species)) {
      freeHouses.delete(r.species);
      freeHomes.delete(r.species);
      houseOf.set(r.person, r.species);
      spotOf.set(r.person, HOME_SPOTS[r.species]);
    }
  }
  let field = 0;
  const spotless: Resident[] = [];
  for (const r of everyone) {
    if (spotOf.has(r.person)) continue;
    const house = HOUSE_KEYS.find((k) => freeHouses.has(k));
    if (house) {
      freeHouses.delete(house);
      houseOf.set(r.person, house);
    }
    const home = HOME_ORDER.find((k) => freeHomes.has(k));
    const spot = home ? HOME_SPOTS[home] : FIELD_SPOTS[field];
    if (home) freeHomes.delete(home);
    else if (spot) field += 1;
    if (spot) spotOf.set(r.person, spot);
    else spotless.push(r);
  }
  // Every spot is held: members without one stand where former members stood, earliest first.
  const reusable = everyone.filter((r) => gone.has(r.person) && spotOf.has(r.person));
  for (const r of spotless) {
    if (gone.has(r.person)) continue;
    const from = reusable.shift();
    const spot = from ? spotOf.get(from.person) : undefined;
    if (!from || !spot) break;
    spotOf.delete(from.person);
    spotOf.set(r.person, spot);
  }

  const houses: PlacedHouse[] = everyone.flatMap((r) => {
    const key = houseOf.get(r.person);
    return key ? [{ key, person: r.person, former: gone.has(r.person) }] : [];
  });
  const critters = everyone
    .flatMap((r) => {
      const spot = spotOf.get(r.person);
      if (!spot || gone.has(r.person)) return [];
      return [{ person: r.person, spot, house: houseOf.get(r.person) ?? null }];
    })
    .sort((a, b) => a.spot.y - b.spot.y);
  return { critters, houses };
}

/** The scene's height for a width, as the design draws the farm: 393 by 540. */
export const sceneHeight = (width: number): number => Math.round((width * 540) / 393);
