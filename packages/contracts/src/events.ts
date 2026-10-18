import { z } from 'zod';

import {
  CardSignedPayload,
  CheckinPayload,
  DewdropPayload,
  FireflyPayload,
  GatePayload,
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
  FarmCreatedPayload,
  FarmOpenedPayload,
  FirePayload,
  HarvestedPayload,
  HibernatePayload,
  JoinedPayload,
  LeftPayload,
  RemovedPayload,
  RestoredPayload,
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

export const isTombstone = (payload: unknown): payload is Tombstone =>
  typeof payload === 'object' && payload !== null && 'tombstone' in payload;

/** An event a person caused; its payload may later become a tombstone. */
const personEvent = <K extends string, P extends z.ZodType>(kind: K, payload: P) =>
  z.object({
    ...envelope,
    actor: PersonId,
    kind: z.literal(kind),
    payload: z.union([Tombstone, payload]),
  });

/**
 * A person's event that the safety team or the farm may also write, then with a null actor.
 * `bySafety` says which payloads those are; the actor must be null exactly for them.
 */
const sharedEvent = <K extends string, P extends z.ZodType>(
  kind: K,
  payload: P,
  bySafety: (payload: z.infer<P>) => boolean,
) =>
  z
    .object({
      ...envelope,
      actor: PersonId.nullable(),
      kind: z.literal(kind),
      payload: z.union([Tombstone, payload]),
    })
    .refine(
      (e) => {
        const { actor, payload: p } = e as unknown as { actor: string | null; payload: unknown };
        return isTombstone(p) || (actor === null) === bySafety(p as z.infer<P>);
      },
      { message: 'Only the farm or the safety team writes with a null actor', path: ['actor'] },
    );

/** An event the farm writes by itself, never tombstoned. */
const farmEvent = <K extends string, P extends z.ZodType>(kind: K, payload: P) =>
  z.object({ ...envelope, actor: z.null(), kind: z.literal(kind), payload });

/** One entry of a farm's log. Edits and unsends never take dew back. */
export const FarmEvent = z.discriminatedUnion('kind', [
  // Chat
  personEvent('message', MessagePayload),
  personEvent('edit', EditPayload),
  sharedEvent('unsend', UnsendPayload, (p) => p.by === 'safety'),
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
  personEvent('card_signed', CardSignedPayload),
  /** A visitor from another farm at the gate; the actor is the visitor. */
  personEvent('gate', GatePayload),
  // Plans
  personEvent('seed_planted', SeedPlantedPayload),
  personEvent('seed_changed', SeedChangedPayload),
  personEvent('vote', VotePayload),
  personEvent('rsvp', RsvpPayload),
  personEvent('checkin', CheckinPayload),
  // Keepsakes
  personEvent('gift', GiftPayload),
  personEvent('scrapbook_page', ScrapbookPagePayload),
  personEvent('traded', TradedPayload),
  // Presence
  personEvent('farm_opened', FarmOpenedPayload),
  personEvent('hibernate', HibernatePayload),
  personEvent('status', StatusPayload),
  sharedEvent('fire', FirePayload, (p) => p.state === 'out'),
  // Membership
  personEvent('joined', JoinedPayload),
  personEvent('left', LeftPayload),
  sharedEvent('removed', RemovedPayload, (p) => p.by === 'safety'),
  personEvent('critter_changed', CritterChangedPayload),
  sharedEvent(
    'settings_changed',
    SettingsChangedPayload,
    (p) => p.setting === 'frozen' || p.setting === 'paused',
  ),
  // Written by the farm
  farmEvent('farm_created', FarmCreatedPayload),
  farmEvent('weather', WeatherPayload),
  farmEvent('shared_rain', SharedRainPayload),
  farmEvent('season_rolled', SeasonRolledPayload),
  farmEvent('harvested', HarvestedPayload),
  farmEvent('rules_changed', RulesChangedPayload),
  farmEvent('restored', RestoredPayload),
]);
export type FarmEvent = z.infer<typeof FarmEvent>;
export type EventKind = FarmEvent['kind'];
export type EventOf<K extends EventKind> = Extract<FarmEvent, { kind: K }>;

export const EVENT_KINDS: readonly EventKind[] = FarmEvent.options.map((o) => o.shape.kind.value);
export const EventKindSchema = z.enum(EVENT_KINDS as [EventKind, ...EventKind[]]);

/**
 * Kinds only the farm writes, some on a person's behalf (`joined`, `farm_opened`, `hibernate`,
 * `gate`, `traded`, with that person as actor). A command can never carry them.
 */
export const FARM_WRITTEN_KINDS = [
  'farm_created',
  'farm_opened',
  'hibernate',
  'joined',
  'gate',
  'traded',
  'weather',
  'shared_rain',
  'season_rolled',
  'harvested',
  'rules_changed',
  'restored',
] as const satisfies readonly EventKind[];

/** Any event kind, known to this app or not. */
export const AnyEventKind = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);

/**
 * Any event's envelope, with the payload unchecked. Sockets and paging carry events in this form so
 * one kind this app doesn't know never fails a batch.
 */
export const EventEnvelope = z.object({
  ...envelope,
  actor: PersonId.nullable(),
  kind: AnyEventKind,
  payload: z.unknown(),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

export type ParsedEvent =
  | { readonly known: true; readonly event: FarmEvent }
  | { readonly known: false; readonly event: EventEnvelope };

/**
 * Sorts an event into one this app knows, or an unknown one to store, step `lastSeq` past and skip
 * in the reducer. A known kind whose payload fails (say, a newer enum value) counts as unknown.
 * Throws a ZodError when the value isn't even an event envelope.
 */
export const parseEvent = (value: unknown): ParsedEvent => {
  const known = FarmEvent.safeParse(value);
  if (known.success) return { known: true, event: known.data };
  return { known: false, event: EventEnvelope.parse(value) };
};
