import { z } from 'zod';

/** The farm socket protocol version, sent in `hello`. Bumped only on a breaking frame change. */
export const PROTOCOL_VERSION = 1;

/** Limits the docs and design notes set; schemas below use them. */
export const LIMITS = {
  /** Critters per farm (11-05, 11-07). */
  members: 24,
  farmName: 32,
  displayName: 32,
  /** A status bubble: 40 characters, shown for 24 hours (04-23). */
  status: 40,
  pins: 10,
  message: 4000,
  fireflyWords: 80,
  /** Friends drawn into one together sticker (08-02). */
  stickerFriends: 4,
  mediaItems: 10,
  /** Voice notes: 5 minutes at most (04-12). */
  voiceMs: 5 * 60_000,
  waveform: 64,
  /** Files up to 100 MB (05-10); presigned multipart above 50 MB. */
  uploadBytes: 100 * 1024 * 1024,
  multipartAboveBytes: 50 * 1024 * 1024,
  /** Events per `events` batch, and how far behind a phone may be before it gets a snapshot. */
  eventsBatch: 200,
  snapshotGap: 500,
  /** The reported event and up to 20 events around it. */
  reportContext: 21,
  url: 2048,
  /** Socket tokens live 5 minutes. */
  rtTokenMs: 5 * 60_000,
} as const;

/** A server-assigned id (person, farm, device, report): URL-safe, at most 64 characters. */
export const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export type Id = z.infer<typeof Id>;
export const PersonId = Id;
export type PersonId = Id;
export const FarmId = Id;
export type FarmId = Id;

/** A client write's id: a lowercase UUIDv7, so a retried write applies once. */
export const OpId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
export type OpId = z.infer<typeof OpId>;

/** A farm log position, assigned by the farm object, from 1. */
export const Seq = z.int().min(1);
export type Seq = z.infer<typeof Seq>;

/** Every instant on the wire is integer milliseconds since the Unix epoch (UTC). */
export const EpochMs = z.int().min(0);
export type EpochMs = z.infer<typeof EpochMs>;

/** A calendar day in the farm's time zone, `YYYY-MM-DD`. */
export const LocalDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
export type LocalDate = z.infer<typeof LocalDate>;

/** A birthday: month and day only, `MM-DD` (07-01). */
export const MonthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
export type MonthDay = z.infer<typeof MonthDay>;

/** A wall-clock time, `HH:MM`, 24-hour. */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export type LocalTime = z.infer<typeof LocalTime>;

/** An IANA time zone name such as `Europe/London`. */
export const TimeZone = z.string().regex(/^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2})$/);
export type TimeZone = z.infer<typeof TimeZone>;

export const CountryCode = z.string().regex(/^[A-Z]{2}$/);
export const HexColor = z.string().regex(/^#[0-9a-f]{6}$/);

/** An identifier the art renderer knows (coat, marking, outfit, sticker, land, theme). */
export const ArtId = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
export type ArtId = z.infer<typeof ArtId>;

/** A plant id from the catalogue in `@kithfield/farm`, which is also its art name. */
export const PlantId = z.string().regex(/^[a-z]{2,24}$/);
export type PlantId = z.infer<typeof PlantId>;

/** Free text: at least one visible character, at most `max`. */
export const text = (max: number) => z.string().max(max).regex(/\S/);

export const Lang = z.enum(['en', 'vi']);
export type Lang = z.infer<typeof Lang>;

export const Season = z.enum(['spring', 'summer', 'autumn', 'winter']);
export type Season = z.infer<typeof Season>;

export const Hemisphere = z.enum(['north', 'south']);
export type Hemisphere = z.infer<typeof Hemisphere>;

/** The six care families, always in this order (15-01). */
export const CareFamily = z.enum(['dew', 'words', 'pictures', 'voices', 'gestures', 'gatherings']);
export type CareFamily = z.infer<typeof CareFamily>;

/** Stage 0–4: seed, sprout, bud, bloom, harvest. Sleepy is a computed flag, never a stage. */
export const PLANT_STAGES = ['seed', 'sprout', 'bud', 'bloom', 'harvest'] as const;
export const PlantStage = z.int().min(0).max(4);
export type PlantStage = z.infer<typeof PlantStage>;

export const RareVariant = z.enum(['rain_kissed', 'frost_lace', 'sun_gold']);
export type RareVariant = z.infer<typeof RareVariant>;

export const Weather = z.enum(['rain', 'frost', 'heat', 'none']);
export type Weather = z.infer<typeof Weather>;

/** The sixteen critters, by their art names. */
export const Species = z.enum([
  'mouse',
  'rabbit',
  'tortoise',
  'fox',
  'duck',
  'bear',
  'hedgehog',
  'otter',
  'frog',
  'capybara',
  'cat',
  'owl',
  'badger',
  'mole',
  'raccoon',
  'sheep',
]);
export type Species = z.infer<typeof Species>;

/** A critter as drawn: body and coat, then the optional layers and cosmetics on display. */
export const Critter = z.object({
  species: Species,
  coat: ArtId,
  mark: ArtId.nullable(),
  accessory: ArtId.nullable(),
  outfit: ArtId.nullable(),
  outfitColor: HexColor.nullable(),
  companion: ArtId.nullable(),
  cottage: ArtId.nullable(),
});
export type Critter = z.infer<typeof Critter>;

export const DisplayName = text(LIMITS.displayName);
export const FarmName = text(LIMITS.farmName);

export const Role = z.enum(['keeper', 'helper', 'critter']);
export type Role = z.infer<typeof Role>;

/** A visit is a one-to-one farm with a porch pot instead of a field. */
export const FarmKind = z.enum(['farm', 'visit']);
export type FarmKind = z.infer<typeof FarmKind>;

/** The twelve warm reactions (05-11), by their icon names. */
export const Reaction = z.enum([
  'dewdrop',
  'sun',
  'heart',
  'sprout',
  'wave',
  'firefly',
  'raincloud',
  'bee',
  'rosette',
  'lantern',
  'leaf',
  'moon',
]);
export type Reaction = z.infer<typeof Reaction>;

/** An uploaded object in R2, keyed `farm/<farmId>/<uuid>`. */
export const MediaRef = z.object({
  key: z.string().regex(/^farm\/[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}$/),
  mime: z.string().regex(/^[a-z]+\/[a-z0-9.+-]{1,80}$/),
  bytes: z.int().min(1).max(LIMITS.uploadBytes),
  width: z.int().min(1).optional(),
  height: z.int().min(1).optional(),
  durationMs: z.int().min(1).optional(),
  name: text(255).optional(),
});
export type MediaRef = z.infer<typeof MediaRef>;

export const HttpUrl = z.url({ protocol: /^https?$/ }).max(LIMITS.url);

/** A place typed for a plan (06-01). Coordinates only when picked from a map result. */
export const Place = z.object({
  name: text(120),
  address: text(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type Place = z.infer<typeof Place>;

/** The keeper's town: sets the farm's day boundaries, season and weather. Coarse, never device location. */
export const FarmPlace = z.object({
  city: text(80),
  country: CountryCode,
  timeZone: TimeZone,
  hemisphere: Hemisphere,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type FarmPlace = z.infer<typeof FarmPlace>;

/** A house rule by number, or one of the categories the safety team acts under. */
export const RuleRef = z.union([
  z.int().min(1).max(20),
  z.enum(['child_safety', 'self_harm', 'credible_threat', 'legal']),
]);
export type RuleRef = z.infer<typeof RuleRef>;
