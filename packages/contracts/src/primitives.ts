import { z } from 'zod';

/**
 * The socket protocol version this package speaks, sent in `hello`. The server compares it and
 * answers `protocol_unsupported` when it can't serve it. Bumped only on a breaking frame change.
 */
export const PROTOCOL_VERSION = 1;

/** Limits the docs and design notes set; schemas below use them. */
export const LIMITS = {
  /** Critters per farm. */
  members: 24,
  farmName: 32,
  displayName: 32,
  /** A status bubble: 40 characters, shown for 24 hours. */
  status: 40,
  pins: 10,
  message: 4000,
  fireflyWords: 80,
  /** Friends drawn into one together sticker. */
  stickerFriends: 4,
  mediaItems: 10,
  /** Voice notes: 5 minutes at most. */
  voiceMs: 5 * 60_000,
  waveform: 64,
  /** Files up to 100 MB; presigned multipart above 50 MB. */
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
  /** The words on a gift's tag. */
  giftNote: 140,
  /** Items on Rocco's cart in one week. */
  cartItems: 12,
  /** Things a person wishes for on their critter card. */
  wishlist: 30,
  /** Voices by the fire; eight seats are drawn, the rest sit as small lanterns. */
  fireVoices: 24,
  /** One piece of a speaker's audio sent for live captions. */
  captionChunkMs: 15_000,
  captionChunkBytes: 512 * 1024,
  /** A caption line, and the Sunday recap letter's body. */
  captionText: 2000,
  recapLetter: 1200,
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

/** A birthday: month and day only, `MM-DD`. */
export const MonthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
export type MonthDay = z.infer<typeof MonthDay>;

/** A wall-clock time, `HH:MM`, 24-hour. */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export type LocalTime = z.infer<typeof LocalTime>;

/** An IANA time zone name such as `Europe/London`. */
export const TimeZone = z.string().regex(/^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2})$/);
export type TimeZone = z.infer<typeof TimeZone>;

export const CountryCode = z.string().regex(/^[A-Z]{2}$/);

/** An app's bundle id (reverse DNS, as Apple has it): which build of the app is asking. */
export const AppBundleId = z
  .string()
  .max(155)
  .regex(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/);

/** An ISO 4217 currency code. */
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);

/**
 * Money we charge outside the app stores (the printed book), in minor units. App Store and Play
 * prices are never sent: the app shows the store's own display price.
 */
export const Money = z.object({ amount: z.int().min(0), currency: CurrencyCode });
export type Money = z.infer<typeof Money>;
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

/** The six care families, always in this order. */
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

/** How a member's cottage came to be left behind. Used by `left` events and the snapshot. */
export const Departure = z.enum(['left', 'removed', 'account_deleted']);
export type Departure = z.infer<typeof Departure>;

/**
 * An open, display-only enum on the wire: any short lowercase name. A newer name an app doesn't
 * know is drawn with a fallback, never rejected, so adding one needs no rules-version bump.
 */
export const openEnum = () => z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);

/**
 * The warm reactions this app knows how to draw, by icon name. The tray's dewdrop is not a
 * reaction: it is a `dewdrop` event with a `target`, drawn in the reaction row.
 */
export const KNOWN_REACTIONS = [
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
] as const;

/** A reaction: an open string on the wire; see `KNOWN_REACTIONS`. Never `dewdrop`. */
export const Reaction = openEnum().refine((r) => r !== 'dewdrop', {
  message: 'A dewdrop on a message is a dewdrop event',
});
export type Reaction = z.infer<typeof Reaction>;

/** An object key in R2: `farm/<farm id>/<uuid>`. */
export const MediaKey = z.string().regex(/^farm\/[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}$/);
export type MediaKey = z.infer<typeof MediaKey>;

/** An uploaded object in R2. */
export const MediaRef = z.object({
  key: MediaKey,
  mime: z.string().regex(/^[a-z]+\/[a-z0-9.+-]{1,80}$/),
  bytes: z.int().min(1).max(LIMITS.uploadBytes),
  width: z.int().min(1).optional(),
  height: z.int().min(1).optional(),
  durationMs: z.int().min(1).optional(),
  name: text(255).optional(),
});
export type MediaRef = z.infer<typeof MediaRef>;

export const HttpUrl = z.url({ protocol: /^https?$/ }).max(LIMITS.url);

/** A place typed for a plan. Coordinates only when picked from a map result. */
export const Place = z.object({
  name: text(120),
  address: text(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type Place = z.infer<typeof Place>;

/**
 * The keeper's town, set in farm settings, for weather only. Coarse, never device location. The
 * farm's day boundaries and season come from its time zone and hemisphere instead.
 */
export const FarmPlace = z.object({
  city: text(80),
  country: CountryCode,
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
