/*
 * The numbers in the farm rules (`docs/farm-model.md`). Changing any of them changes growth, so it
 * ships with a rules-version bump.
 */

/** The highest farm rules version this reducer implements. */
export const RULES_VERSION = 1;

/** Each person adds at most this much dew to each plant per farm day. */
export const DAILY_CAP = 3;

/** Dew a plant needs for each stage on a farm of up to three active members (`k = 1`). */
export const THRESHOLDS = { sprout: 3, bud: 8, bloom: 15 } as const;

/** Stage indexes, as `PLANT_STAGES` names them. */
export const STAGE = { seed: 0, sprout: 1, bud: 2, bloom: 3, harvest: 4 } as const;

/** Members a farm's growth scaling divides by: `k = max(1, √(active / 3))`. */
export const K_DIVISOR = 3;

/** A hangout with at least this many people checked in gives each of them `HANGOUT_DEW`. */
export const HANGOUT_PEOPLE = 2;
export const HANGOUT_DEW = 3;

/** Shared rain: this many members opening the farm within the window, at most once a day. */
export const SHARED_RAIN_PEOPLE = 3;
export const SHARED_RAIN_WINDOW_MS = 10 * 60_000;

/** The chance a blooming plant turns rare on a day with weather, and with shared rain that day. */
export const RARE_CHANCE = 0.15;
export const RARE_CHANCE_SHARED_RAIN = 0.4;

export const DAY_MS = 86_400_000;

/** A critter dozes after this many days without opening the farm. */
export const CRITTER_SLEEPY_DAYS = 4;

/** The farm mists over when nobody has opened it for this many days. */
export const FARM_MISTY_DAYS = 14;

/** Messages can be edited for this long after sending. */
export const EDIT_WINDOW_MS = 15 * 60_000;

/** A status bubble shows for 24 hours; a rain cloud clears after 48. */
export const STATUS_MS = DAY_MS;
export const CLOUD_MS = 2 * DAY_MS;
