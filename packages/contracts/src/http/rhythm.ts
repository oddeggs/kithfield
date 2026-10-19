import { z } from 'zod';

import { EventEnvelope } from '../events';
import { WeatherSource } from '../payloads/farm';
import {
  EpochMs,
  FarmId,
  HttpUrl,
  Lang,
  LIMITS,
  LocalDate,
  PersonId,
  PlantId,
  Seq,
  openEnum,
  text,
} from '../primitives';
import { Credit } from '../snapshot';

/*
 * The farm's rhythm over HTTP: the scrapbook, the Sunday recap and the weather's attribution.
 * Birthdays, shared rain, seasons, harvest, the field guide, trades, the porch pot and the
 * restoration project live in the farm's log and snapshot.
 */

/** A non-negative whole number written plainly in a query string. */
const queryInt = z
  .string()
  .regex(/^(0|[1-9]\d{0,14})$/)
  .transform(Number);

/** `GET /v1/farms/:id/scrapbook?before=`: the newest pages first, or those before a page's seq. */
export const ScrapbookQuery = z.object({ before: queryInt.pipe(Seq).optional() });
export type ScrapbookQuery = z.infer<typeof ScrapbookQuery>;

/**
 * A pressed page with what was kept on it: the messages, photos and voice notes it names, as
 * envelopes (sort each with `parseEvent`; one unsent since is a tombstone, drawn as a gap).
 */
export const ScrapbookPage = z.object({
  seq: Seq,
  at: EpochMs,
  actor: PersonId.nullable(),
  title: text(80),
  seed: Seq.nullable(),
  flower: PlantId.nullable(),
  items: z.array(EventEnvelope).max(50),
});
export type ScrapbookPage = z.infer<typeof ScrapbookPage>;

/**
 * The farm's scrapbook, without pages any member hid or that were unsent. A visit's porch keeps
 * its pressed blooms in the snapshot (`pot.pressed`) instead.
 */
export const ScrapbookList = z.object({
  pages: z.array(ScrapbookPage).max(50),
  more: z.boolean(),
});
export type ScrapbookList = z.infer<typeof ScrapbookList>;

/** The reasons for a best pollinator this app has words for. */
export const KNOWN_POLLINATOR_REASONS = [
  'checked_on_everyone',
  'planned_a_hangout',
  'came_back',
  'shared_pictures',
  'by_the_fire',
  'kept_it_warm',
] as const;

/**
 * Why someone is the week's best pollinator: an open name on the wire, drawn from the catalogue
 * of copy, with a plain fallback for one this app doesn't know. Always a kind of care, never a
 * count.
 */
export const PollinatorReason = openEnum();
export type PollinatorReason = z.infer<typeof PollinatorReason>;

/** `GET /v1/farms/:id/recap?week=`: a week by its Sunday; without it, the latest. */
export const RecapQuery = z.object({ week: LocalDate.optional() });
export type RecapQuery = z.infer<typeof RecapQuery>;

/**
 * The Sunday harvest recap for the week ending on `week` (farm time). The best pollinator rotates
 * week to week. `thanks` names everyone who tended and the kinds of care they gave, never totals,
 * so quiet friends' dewdrops and fireflies are thanked too. `letter` is written with an AI from the
 * words of friends who said yes (`recap` consent), in the asker's language; while it is
 * `writing`, or when nobody said yes (`none`), the app writes the letter itself from `thanks` and
 * `plans`, with no AI.
 */
export const WeeklyRecap = z
  .object({
    farm: FarmId,
    week: LocalDate,
    pollinator: z.object({ person: PersonId, reason: PollinatorReason }).nullable(),
    thanks: z.array(Credit).max(LIMITS.members),
    /** Plans planted or sprouted, and hangouts held, that week, by seq. */
    plans: z.array(Seq).max(50),
    letterState: z.enum(['written', 'writing', 'none']),
    letter: z.object({ lang: Lang, title: text(80), body: text(LIMITS.recapLetter) }).nullable(),
  })
  .refine((r) => (r.letterState === 'written') === (r.letter !== null), {
    message: 'A written recap has its letter, and only a written one',
    path: ['letter'],
  });
export type WeeklyRecap = z.infer<typeof WeeklyRecap>;

/**
 * `GET /v1/weather/attribution?source=&lang=`: what the app shows wherever the weather changes the
 * farm (the weather chip and sheet, the widget's detail, the umbrella, About): the provider's mark,
 * never altered or recoloured, and a link to its legal page. For WeatherKit the server caches
 * Apple's attribution; the same applies on web and Android.
 */
export const WeatherAttributionQuery = z.object({ source: WeatherSource, lang: Lang });
export type WeatherAttributionQuery = z.infer<typeof WeatherAttributionQuery>;

export const WeatherAttribution = z.object({
  source: WeatherSource,
  serviceName: text(80),
  /** The combined mark for light and dark backgrounds. */
  markLight: HttpUrl,
  markDark: HttpUrl,
  legalUrl: HttpUrl,
});
export type WeatherAttribution = z.infer<typeof WeatherAttribution>;
