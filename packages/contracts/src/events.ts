import { z } from 'zod';

import {
  CheckinPayload,
  DewdropPayload,
  FireflyPayload,
  GiftPayload,
  HugPayload,
  KnockPayload,
  QuietNotePayload,
  RsvpPayload,
  ScrapbookPagePayload,
  SeedChangedPayload,
  SeedPlantedPayload,
  SlowPostPayload,
  VotePayload,
  WavePayload,
} from './payloads/care';
import {
  EditPayload,
  LinkPayload,
  MediaPayload,
  MessagePayload,
  PinPayload,
  ReactionPayload,
  StickerPayload,
  Tombstone,
  UnsendPayload,
  VoicePayload,
} from './payloads/chat';
import {
  CritterChangedPayload,
  FarmOpenedPayload,
  FirePayload,
  HarvestedPayload,
  HibernatePayload,
  JoinedPayload,
  LeftPayload,
  RemovedPayload,
  RulesChangedPayload,
  SeasonRolledPayload,
  SettingsChangedPayload,
  SharedRainPayload,
  StatusPayload,
  TradedPayload,
  WeatherPayload,
} from './payloads/farm';
import { EpochMs, OpId, PersonId, Seq } from './primitives';

/** The version of the farm rules an event was applied under. */
export const RulesVersion = z.int().min(1);
export type RulesVersion = z.infer<typeof RulesVersion>;

/**
 * Every event: its place in the log, the writer's op id (the farm mints one for its own events),
 * server time, and the rules version it was applied under.
 */
const envelope = { seq: Seq, opId: OpId, at: EpochMs, rulesVersion: RulesVersion };

/** An event a person caused. Its payload may later become a tombstone. `actor` is null when the farm or the safety team wrote it. */
const personEvent = <K extends string, P extends z.ZodType>(kind: K, payload: P) =>
  z.object({
    ...envelope,
    actor: PersonId.nullable(),
    kind: z.literal(kind),
    payload: z.union([Tombstone, payload]),
  });

/** An event the farm writes by itself, never tombstoned. */
const farmEvent = <K extends string, P extends z.ZodType>(kind: K, payload: P) =>
  z.object({ ...envelope, actor: z.null(), kind: z.literal(kind), payload });

/** One entry of a farm's log. Edits and unsends never take dew back. */
export const FarmEvent = z.discriminatedUnion('kind', [
  // Chat
  personEvent('message', MessagePayload),
  personEvent('edit', EditPayload),
  personEvent('unsend', UnsendPayload),
  personEvent('reaction', ReactionPayload),
  personEvent('sticker', StickerPayload),
  personEvent('media', MediaPayload),
  personEvent('voice', VoicePayload),
  personEvent('link', LinkPayload),
  personEvent('pin', PinPayload),
  // Gestures
  personEvent('dewdrop', DewdropPayload),
  personEvent('firefly', FireflyPayload),
  personEvent('wave', WavePayload),
  personEvent('knock', KnockPayload),
  personEvent('hug', HugPayload),
  personEvent('quiet_note', QuietNotePayload),
  personEvent('slow_post', SlowPostPayload),
  // Plans
  personEvent('seed_planted', SeedPlantedPayload),
  personEvent('seed_changed', SeedChangedPayload),
  personEvent('vote', VotePayload),
  personEvent('rsvp', RsvpPayload),
  personEvent('checkin', CheckinPayload),
  // Keepsakes
  personEvent('gift', GiftPayload),
  personEvent('scrapbook_page', ScrapbookPagePayload),
  // Presence
  personEvent('farm_opened', FarmOpenedPayload),
  personEvent('hibernate', HibernatePayload),
  personEvent('status', StatusPayload),
  personEvent('fire', FirePayload),
  // Membership
  personEvent('joined', JoinedPayload),
  personEvent('left', LeftPayload),
  personEvent('removed', RemovedPayload),
  personEvent('critter_changed', CritterChangedPayload),
  personEvent('settings_changed', SettingsChangedPayload),
  // Written by the farm
  farmEvent('weather', WeatherPayload),
  farmEvent('shared_rain', SharedRainPayload),
  farmEvent('season_rolled', SeasonRolledPayload),
  farmEvent('harvested', HarvestedPayload),
  farmEvent('rules_changed', RulesChangedPayload),
  farmEvent('traded', TradedPayload),
]);
export type FarmEvent = z.infer<typeof FarmEvent>;
export type EventKind = FarmEvent['kind'];
export type EventOf<K extends EventKind> = Extract<FarmEvent, { kind: K }>;

export const EVENT_KINDS: readonly EventKind[] = FarmEvent.options.map((o) => o.shape.kind.value);
export const EventKindSchema = z.enum(EVENT_KINDS as [EventKind, ...EventKind[]]);

/** Kinds only the farm writes; a command can never carry them. */
export const FARM_WRITTEN_KINDS = [
  'farm_opened',
  'joined',
  'weather',
  'shared_rain',
  'season_rolled',
  'harvested',
  'rules_changed',
  'traded',
] as const satisfies readonly EventKind[];

export const isTombstone = (payload: object): payload is Tombstone => 'tombstone' in payload;
