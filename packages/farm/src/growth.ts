import {
  type CareFamily,
  type EventKind,
  type Credit,
  type EpochMs,
  type FarmEvent,
  type FarmState,
  type FieldGuidePage,
  type LocalDate,
  type PersonId,
  type PlantState,
  type PlantStage,
  type RareVariant,
  type Weather,
  isTombstone,
  LIMITS,
} from '@kithfield/contracts';

import { PLANT_BY_ID, RARE_VARIANTS, plantFor, type CatalogPlantId } from './catalog';
import { rareRoll } from './hash';
import {
  DAILY_CAP,
  K_DIVISOR,
  RARE_CHANCE,
  RARE_CHANCE_SHARED_RAIN,
  STAGE,
  THRESHOLDS,
} from './rules';

/** The fields of an event the reducer may read: its payload, or what its tombstone kept. */
export const factsOf = (event: FarmEvent): Readonly<Record<string, unknown>> => {
  if (isTombstone(event.payload)) return event.payload.facts ?? {};
  if (event.kind !== 'gate') return event.payload;
  // A gate keeps its gesture as `action`, the same way its tombstone does.
  const { gesture, ...rest } = event.payload.gesture;
  return { ...event.payload, ...rest, action: gesture };
};

export interface Care {
  readonly family: CareFamily;
  readonly dew: number;
}

type Facts = Readonly<Record<string, unknown>>;
const care =
  (family: CareFamily, dew = 1, when: (facts: Facts) => boolean = () => true) =>
  (facts: Facts): Care | null =>
    when(facts) ? { family, dew } : null;

/**
 * The care families table: what each kind grows, and how much dew. Kinds not listed grow nothing:
 * reactions, edits, presence and the farm's own kinds. A check-in grows through its hangout, and
 * shared rain through each person in it.
 */
export const CARE: Partial<Record<EventKind, (facts: Facts) => Care | null>> = {
  dewdrop: care('dew'),
  message: care('words'),
  link: care('words'),
  quiet_note: care('words', 2),
  slow_post: care('words', 2),
  media: care('pictures', 2),
  sticker: care('pictures'),
  voice: care('voices', 2),
  fire: care('voices', 2, (f) => f['state'] === 'sat'),
  firefly: care('gestures', 2, (f) => f['action'] === 'left'),
  wave: care('gestures'),
  knock: care('gestures'),
  hug: care('gestures'),
  gift: care('gestures', 2, (f) => f['action'] === 'given'),
  seed_planted: care('gatherings'),
  vote: care('gatherings', 1, (f) => f['on'] === true),
  rsvp: care('gatherings'),
  scrapbook_page: care('gatherings', 1, (f) => f['action'] === 'pressed'),
};

/** What one event grows; null if nothing. Reads only facts a tombstone keeps. */
export const careOf = (event: FarmEvent): Care | null => CARE[event.kind]?.(factsOf(event)) ?? null;

/** The growth scaling: `k = max(1, √(active / 3))`. */
export const kFor = (active: number): number => Math.max(1, Math.sqrt(active / K_DIVISOR));

/**
 * `ceil(base × k)` in whole numbers: the smallest `t` with `3t² ≥ base² × active`, so no
 * floating-point rounding can make two devices disagree.
 */
const scaled = (base: number, active: number): number => {
  const n = Math.max(active, K_DIVISOR);
  let t = base;
  while (K_DIVISOR * t * t < base * base * n) t++;
  return t;
};

export interface Thresholds {
  readonly sprout: number;
  readonly bud: number;
  readonly bloom: number;
}

export const thresholdsFor = (active: number): Thresholds => ({
  sprout: scaled(THRESHOLDS.sprout, active),
  bud: scaled(THRESHOLDS.bud, active),
  bloom: scaled(THRESHOLDS.bloom, active),
});

/** The stage dew alone reaches, up to bloom; harvest only comes on harvest day. */
export const stageFromDew = (dew: number, t: Thresholds): PlantStage =>
  dew >= t.bloom ? STAGE.bloom : dew >= t.bud ? STAGE.bud : dew >= t.sprout ? STAGE.sprout : 0;

/**
 * Members active this season: everyone credited on this season's plants. Credits keep person ids
 * only, so the count is the same after a tombstone, a departure or a deleted account.
 */
export const activeCount = (state: FarmState): number => {
  const people = new Set<PersonId>();
  for (const plant of state.plants) for (const credit of plant.credits) people.add(credit.person);
  return Math.min(people.size, LIMITS.members);
};

/** A visit's porch pot grows with `k = 1`. */
export const thresholdsOf = (state: FarmState): Thresholds =>
  thresholdsFor(state.kind === 'visit' ? 1 : activeCount(state));

export const freshPlant = (plant: string): PlantState => ({
  plant,
  stage: STAGE.seed,
  dew: 0,
  rare: null,
  rareRolledOn: null,
  bloomedAt: null,
  credits: [],
});

const credit = (credits: readonly Credit[], person: PersonId, kind: string): Credit[] => {
  const found = credits.find((c) => c.person === person);
  if (!found)
    return credits.length < LIMITS.members ? [...credits, { person, kinds: [kind] }] : [...credits];
  if (found.kinds.includes(kind) || found.kinds.length >= 40) return [...credits];
  return credits.map((c) => (c === found ? { person, kinds: [...c.kinds, kind] } : c));
};

/** Adds a field guide page unless the farm already has it. */
export const withPage = (state: FarmState, page: FieldGuidePage): FarmState => {
  const has = state.fieldGuide.some((p) => p.plant === page.plant && p.variant === page.variant);
  // A visit's blooms press into its own scrapbook, never a field guide.
  if (has || state.kind !== 'farm' || state.fieldGuide.length >= 1000) return state;
  return { ...state, fieldGuide: [...state.fieldGuide, page] };
};

const variantFor = (weather: Weather): RareVariant | null =>
  RARE_VARIANTS.find((v) => v.weather === weather)?.id ?? null;

/**
 * Each plant gets one rare roll a season, on the first day with weather (rain, frost or heat) or
 * shared rain on or after it blooms: `hash(farm, plant, day, weather)` under 0.15, or 0.40 with
 * shared rain that day. Shared rain alone counts as rain. Shared rain later that same day may roll
 * again with the higher chance; after that day the variant is fixed for the season.
 */
export const withRareCheck = (state: FarmState, plant: string, day: LocalDate, at: EpochMs) => {
  const index = state.plants.findIndex((p) => p.plant === plant);
  const target = state.plants[index];
  const entry = PLANT_BY_ID.get(plant as CatalogPlantId);
  if (state.kind !== 'farm' || !target || !entry?.canBeRare) return state;
  if (target.stage !== STAGE.bloom || target.rare !== null) return state;
  if (target.rareRolledOn !== null && target.rareRolledOn !== day) return state;
  const sharedRain = state.sharedRainDay === day;
  const recorded = state.weather?.day === day ? state.weather.weather : 'none';
  const weather: Weather | null = recorded !== 'none' ? recorded : sharedRain ? 'rain' : null;
  const variant = weather && variantFor(weather);
  if (!weather || !variant) return state;
  const chance = sharedRain ? RARE_CHANCE_SHARED_RAIN : RARE_CHANCE;
  const rare = rareRoll(state.farm, plant, day, weather) < chance ? variant : null;
  const plants = state.plants.map((p, i) => (i === index ? { ...p, rare, rareRolledOn: day } : p));
  const rolled = { ...state, plants };
  if (!rare) return rolled;
  return withPage(rolled, {
    plant,
    variant: rare,
    season: state.season,
    foundAt: at,
    via: 'grown',
  });
};

export interface Tend {
  readonly person: PersonId;
  readonly family: CareFamily;
  readonly dew: number;
  /** The kind of care, for credits. */
  readonly kind: string;
  readonly at: EpochMs;
  readonly day: LocalDate;
}

/** Room left under the daily cap, and the `today` list with this tend's dew recorded. */
const takeDew = (state: FarmState, person: PersonId, plant: string, dew: number) => {
  const given = state.today.given;
  const index = given.findIndex((g) => g.person === person && g.plant === plant);
  const before = given[index]?.dew ?? 0;
  const added = Math.max(0, Math.min(dew, DAILY_CAP - before));
  if (added === 0) return { added, today: state.today };
  const entry = { person, plant, dew: before + added };
  const next = index >= 0 ? given.map((g, i) => (i === index ? entry : g)) : [...given, entry];
  return { added, today: { ...state.today, given: next } };
};

/** The plants one tend grows: its family's plant and the signature crop, or a visit's pot. */
const targetsOf = (state: FarmState, family: CareFamily): string[] => {
  if (state.kind === 'visit') return state.pot ? [state.pot.plant] : [];
  const own = plantFor(family, state.season.season);
  return state.signature && state.signature !== own ? [own, state.signature] : [own];
};

const grow = (plant: PlantState, dew: number, t: Thresholds, at: EpochMs): PlantState => {
  const stage = Math.max(plant.stage, stageFromDew(plant.dew + dew, t));
  const bloomedAt = plant.bloomedAt ?? (stage >= STAGE.bloom ? at : null);
  return { ...plant, dew: plant.dew + dew, stage, bloomedAt };
};

/**
 * One tend: wakes the family's plants, credits the person, and adds dew up to the daily cap.
 * Tends over the cap still count for sleepiness and credits.
 */
export const applyTend = (state: FarmState, tend: Tend): FarmState => {
  const { person, family, at, day } = tend;
  const members = state.members.map((m) =>
    m.person === person ? { ...m, lastTendedAt: at, activeThisSeason: true } : m,
  );
  let next: FarmState = {
    ...state,
    members,
    familyTendedAt: { ...state.familyTendedAt, [family]: at },
  };
  const targets = targetsOf(state, family);
  // Credits first: a new person raises `k` before their own dew counts.
  next = {
    ...next,
    plants: next.plants.map((p) =>
      targets.includes(p.plant) ? { ...p, credits: credit(p.credits, person, tend.kind) } : p,
    ),
    pot: next.pot && { ...next.pot, credits: credit(next.pot.credits, person, tend.kind) },
  };
  const t = thresholdsOf(next);
  const bloomed: string[] = [];
  for (const plant of targets) {
    const { added, today } = takeDew(next, person, plant, tend.dew);
    next = { ...next, today };
    if (next.pot && next.pot.plant === plant) {
      next = { ...next, pot: { ...next.pot, ...grow(next.pot, added, t, at) } };
      continue;
    }
    next = {
      ...next,
      plants: next.plants.map((p) => {
        if (p.plant !== plant) return p;
        const grown = grow(p, added, t, at);
        if (p.stage < STAGE.bloom && grown.stage >= STAGE.bloom) bloomed.push(plant);
        return grown;
      }),
    };
  }
  for (const plant of bloomed) {
    next = withPage(next, { plant, variant: null, season: next.season, foundAt: at, via: 'grown' });
    next = withRareCheck(next, plant, day, at);
  }
  return next;
};
