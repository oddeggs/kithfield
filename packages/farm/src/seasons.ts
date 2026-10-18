import {
  type Crop,
  type EpochMs,
  type EventOf,
  type FarmEvent,
  type FarmState,
  type HarvestedPayload,
  type Hemisphere,
  type LocalDate,
  type PlantState,
  type SeasonRef,
  type SharedRainPayload,
  LIMITS,
} from '@kithfield/contracts';

import { FAMILIES, PORCH_POT, plantFor } from './catalog';
import { factsOf, freshPlant, withPage, withRareCheck } from './growth';
import { SHARED_RAIN_PEOPLE, SHARED_RAIN_WINDOW_MS, STAGE } from './rules';
import {
  addDays,
  harvestDay,
  laterDay,
  localDay,
  sameSeason,
  seasonDays,
  seasonOf,
  startOfDay,
} from './time';

/* Seasons, harvest day, weather, shared rain and trades. */

/** A season's six family plants, then the signature crop. */
export const freshPlants = (season: SeasonRef, signature: string | null): PlantState[] => [
  ...FAMILIES.map((family) => freshPlant(plantFor(family, season.season))),
  ...(signature ? [freshPlant(signature)] : []),
];

export const freshPot = (season: SeasonRef) => ({
  ...freshPlant(PORCH_POT[season.season]),
  pressed: [],
});

/** A new season: fresh plants, and everyone starts it inactive. Past seasons are never recomputed. */
export const applySeasonRolled = (state: FarmState, event: EventOf<'season_rolled'>): FarmState => {
  const season = { season: event.payload.season, year: event.payload.year };
  if (sameSeason(season, state.season)) return state;
  const plants = state.kind === 'farm' ? freshPlants(season, state.signature) : [];
  const pot = state.pot && { ...freshPot(season), pressed: state.pot.pressed };
  // Today's cap carries over only for plants that stay, such as the signature crop.
  const growing = new Set([...plants.map((p) => p.plant), ...(pot ? [pot.plant] : [])]);
  return {
    ...state,
    season,
    plants,
    pot,
    today: { ...state.today, given: state.today.given.filter((g) => growing.has(g.plant)) },
    members: state.members.map((m) => ({ ...m, activeThisSeason: false })),
  };
};

const cropOf = (plant: PlantState): Crop => ({ plant: plant.plant, variant: plant.rare });

/**
 * Harvest day: every plant that reached bloom goes into the season's basket; the rest rest. A
 * visit's bloom presses into its own scrapbook instead of a field guide.
 */
export const applyHarvested = (state: FarmState, event: EventOf<'harvested'>): FarmState => {
  const season = { season: event.payload.season, year: event.payload.year };
  if (!sameSeason(season, state.season)) return state;
  const harvest = (p: PlantState) => (p.stage >= STAGE.bloom ? { ...p, stage: STAGE.harvest } : p);
  const plants = state.plants.map(harvest);
  const pot = state.pot && { ...state.pot, ...harvest(state.pot) };
  // A visit's pot presses into its own scrapbook, never a basket; its empty basket marks the harvest.
  const grown = plants.filter((p) => p.stage === STAGE.harvest);
  const kept = state.basket && sameSeason(state.basket.season, season) ? state.basket.crops : [];
  const crops = [
    ...kept,
    ...grown.map(cropOf).filter((c) => !kept.some((k) => k.plant === c.plant)),
  ];
  const pressed =
    pot && pot.stage === STAGE.harvest && !pot.pressed.some((p) => sameSeason(p.season, season))
      ? [...pot.pressed, { season, plant: pot.plant, pressedAt: event.at }].slice(-400)
      : pot?.pressed;
  return {
    ...state,
    plants,
    pot: pot && pressed ? { ...pot, pressed } : pot,
    basket: { season, crops: crops.slice(0, 8) },
  };
};

/** Blooming plants get their chance at a rare variant whenever the day's weather changes. */
const withRareChecks = (state: FarmState, day: LocalDate, at: EpochMs): FarmState =>
  state.plants.reduce((next, p) => withRareCheck(next, p.plant, day, at), state);

export const applyWeather = (state: FarmState, event: EventOf<'weather'>): FarmState => {
  const { day, weather } = event.payload;
  return withRareChecks({ ...state, weather: { day, weather } }, day, event.at);
};

/** Shared rain marks the day; the reducer grows a Gatherings tend for each person separately. */
export const applySharedRainDay = (state: FarmState, event: EventOf<'shared_rain'>): FarmState =>
  withRareChecks({ ...state, sharedRainDay: event.payload.day }, event.payload.day, event.at);

const isCrop = (value: unknown): value is Crop =>
  typeof value === 'object' && value !== null && 'plant' in value && 'variant' in value;

/** A swap on a visit: the crop that came fills a field guide page, and the basket trades places. */
export const applyTraded = (state: FarmState, event: EventOf<'traded'>): FarmState => {
  const facts = factsOf(event);
  const gave = isCrop(facts['gave']) ? facts['gave'] : null;
  const got = isCrop(facts['got']) ? facts['got'] : null;
  let next = state;
  if (next.basket) {
    const index = gave
      ? next.basket.crops.findIndex((c) => c.plant === gave.plant && c.variant === gave.variant)
      : -1;
    const crops = next.basket.crops.filter((_, i) => i !== index);
    next = {
      ...next,
      basket: { ...next.basket, crops: got ? [...crops, got].slice(0, 8) : crops },
    };
  }
  if (!got) return next;
  const page = { ...got, season: state.season, foundAt: event.at, via: 'traded' as const };
  return withPage(next, page);
};

/**
 * The farm day an event counts on: the `day` the farm stamped on it, never worked out from this
 * device's time-zone data. Only development events from before rules version 2 lack one; those
 * fall back to the farm's time zone. Never before the day the farm has already reached.
 */
export const eventDay = (state: FarmState, event: FarmEvent): LocalDate =>
  laterDay(state.today.day, event.day ?? localDay(event.at, state.timeZone));

/** The farm's day at an instant, for views and chores: never before the day the farm has reached. */
export const farmDay = (state: FarmState, at: EpochMs): LocalDate =>
  laterDay(state.today.day, localDay(at, state.timeZone));

const other = (h: Hemisphere): Hemisphere => (h === 'north' ? 'south' : 'north');

/**
 * The hemisphere the current season was named under. It is the farm's hemisphere, except just
 * after the keeper changed it: the new one names seasons from the next `season_rolled`.
 */
const namedUnder = (state: FarmState, today: LocalDate): Hemisphere => {
  const starts = [state.hemisphere, other(state.hemisphere)]
    .map((h) => ({ h, first: seasonDays(state.season, h).first }))
    .filter((s) => s.first <= today)
    .sort((a, b) => (a.first < b.first ? 1 : -1));
  return starts[0]?.h ?? state.hemisphere;
};

/** The season the calendar has reached, when `season_rolled` hasn't landed yet. */
export const pendingSeason = (state: FarmState, today: LocalDate): SeasonRef | null => {
  const calendar = seasonOf(today, state.hemisphere);
  if (sameSeason(calendar, state.season)) return null;
  const current = seasonDays(state.season, namedUnder(state, today)).first;
  return seasonDays(calendar, state.hemisphere).first > current ? calendar : null;
};

/** The current season's harvest day. */
export const harvestDayOf = (state: FarmState, today: LocalDate): LocalDate =>
  harvestDay(state.season, namedUnder(state, today));

export interface FarmChores {
  /** Harvest the current season (write it before rolling). */
  readonly harvest: HarvestedPayload | null;
  /** Roll to the season the calendar has reached. */
  readonly roll: SeasonRef | null;
  /** Three or more members opened the farm within ten minutes, and it hasn't rained together today. */
  readonly sharedRain: SharedRainPayload | null;
}

/** What the farm should write now, from its alarms and presence. Pure: the farm object writes them. */
export const farmChores = (state: FarmState, now: EpochMs): FarmChores => {
  const today = farmDay(state, now);
  const harvested = state.basket !== null && sameSeason(state.basket.season, state.season);
  const due = today >= harvestDayOf(state, today) && !harvested;
  const people = state.members
    .filter((m) => m.lastOpenedAt !== null && m.lastOpenedAt <= now)
    .filter((m) => now - (m.lastOpenedAt ?? 0) <= SHARED_RAIN_WINDOW_MS)
    .map((m) => m.person)
    .slice(0, LIMITS.members);
  return {
    harvest: due ? { ...state.season, day: today } : null,
    roll: pendingSeason(state, today),
    sharedRain:
      people.length >= SHARED_RAIN_PEOPLE && state.sharedRainDay !== today
        ? { day: today, people }
        : null,
  };
};

/**
 * When the farm object should next wake for a chore: now if one is due, else the start of harvest
 * day or of the next season, in farm time. Shared rain comes from presence, never an alarm.
 */
export const nextChoreAt = (state: FarmState, now: EpochMs): EpochMs => {
  const chores = farmChores(state, now);
  if (chores.harvest || chores.roll) return now;
  const today = farmDay(state, now);
  const harvested = state.basket !== null && sameSeason(state.basket.season, state.season);
  const next = addDays(seasonDays(state.season, namedUnder(state, today)).last, 1);
  const times = [
    ...(harvested ? [] : [startOfDay(harvestDayOf(state, today), state.timeZone)]),
    startOfDay(next, state.timeZone),
  ].filter((t) => t > now);
  return times.length > 0 ? Math.min(...times) : now;
};
