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
import { Tombstone } from './payloads/tombstone';
import { EpochMs, LocalDate, OpId, PersonId, Seq } from './primitives';

/** The version of the farm rules an event was applied under. */
export const RulesVersion = z.int().min(1);
export type RulesVersion = z.infer<typeof RulesVersion>;

/**
 * The first rules version whose events carry `day`. From it on, every event has one; events
 * applied under an older rules version (development data only) may lack it.
 */
export const DAY_FROM_RULES_VERSION = 2;

/**
 * Every event: its place in the log, the writer's op id (the farm mints one for its own events),
 * server time, the farm-time local day, and the rules version it was applied under.
 */
const envelope = {
  seq: Seq,
  opId: OpId,
  at: EpochMs,
  /**
   * The farm's local day the event happened on, set by the farm at commit from the farm's time
   * zone. Caps, roses and every other day rule read it, never the device's time-zone data.
   */
  day: LocalDate.optional(),
  rulesVersion: RulesVersion,
};

/** From `DAY_FROM_RULES_VERSION` on, an event must carry its day. */
const hasDay = (e: { day?: string | undefined; rulesVersion: number }) =>
  e.rulesVersion < DAY_FROM_RULES_VERSION || e.day !== undefined;
const dayRule = {
  message: 'Events from this rules version carry their farm-time day',
  path: ['day'],
};

export const isTombstone = (payload: unknown): payload is Tombstone =>
  typeof payload === 'object' && payload !== null && 'tombstone' in payload;

/** A payload that may later become a tombstone. */
const tombstonable = <P extends z.ZodType>(payload: P) => z.union([Tombstone, payload]);

/** An event a person caused; its payload may later become a tombstone. */
const personEvent = <K extends string, P extends z.ZodType>(kind: K, payload: P) =>
  z.object({ ...envelope, actor: PersonId, kind: z.literal(kind), payload: tombstonable(payload) });

/** Who may write a payload: a person, only the farm or the safety team (null actor), or either. */
type Writer = 'person' | 'farm' | 'either';

/**
 * A person's event that the safety team or the farm may also write, then with a null actor.
 * `writer` says which payloads those are.
 */
const sharedEvent = <K extends string, S extends z.ZodType>(
  kind: K,
  payload: S,
  writer: (payload: Record<string, unknown>) => Writer,
) =>
  z.object({ ...envelope, actor: PersonId.nullable(), kind: z.literal(kind), payload }).refine(
    (e) => {
      const { actor, payload: p } = e as unknown as {
        actor: string | null;
        payload: Record<string, unknown>;
      };
      if (isTombstone(p)) return true;
      const w = writer(p);
      return w === 'either' || (actor === null) === (w === 'farm');
    },
    { message: 'Only the farm or the safety team writes with a null actor', path: ['actor'] },
  );

const safetyIf = (yes: boolean): Writer => (yes ? 'farm' : 'person');

/** An event the farm writes by itself, never tombstoned. */
const farmEvent = <K extends string, P extends z.ZodType>(kind: K, payload: P) =>
  z.object({ ...envelope, actor: z.null(), kind: z.literal(kind), payload });

/** One entry of a farm's log. Edits and unsends never take dew back. */
export const FarmEvent = z
  .discriminatedUnion('kind', [
    // Chat
    personEvent('message', MessagePayload),
    personEvent('edit', EditPayload),
    sharedEvent('unsend', tombstonable(UnsendPayload), (p) => safetyIf(p['by'] === 'safety')),
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
    sharedEvent('fire', tombstonable(FirePayload), (p) => safetyIf(p['state'] === 'out')),
    // Membership
    personEvent('joined', JoinedPayload),
    personEvent('left', LeftPayload),
    sharedEvent('removed', tombstonable(RemovedPayload), (p) => safetyIf(p['by'] === 'safety')),
    personEvent('critter_changed', CritterChangedPayload),
    /**
     * Farm settings are the farm's, not a person's content: never tombstoned. `frozen` and `paused`
     * come from the safety team; a keeper handover when the last keeper leaves or is removed comes
     * from the farm. Both with a null actor.
     */
    sharedEvent('settings_changed', SettingsChangedPayload, (p) =>
      p['setting'] === 'frozen' || p['setting'] === 'paused'
        ? 'farm'
        : p['setting'] === 'role' && p['role'] === 'keeper'
          ? 'either'
          : 'person',
    ),
    // Written by the farm
    farmEvent('farm_created', FarmCreatedPayload),
    farmEvent('weather', WeatherPayload),
    farmEvent('shared_rain', SharedRainPayload),
    farmEvent('season_rolled', SeasonRolledPayload),
    farmEvent('harvested', HarvestedPayload),
    farmEvent('rules_changed', RulesChangedPayload),
    farmEvent('restored', RestoredPayload),
  ])
  .refine(hasDay, dayRule);
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
 * Kinds the farm may write on a person's behalf, with that person as actor and an op id the farm
 * mints. The first five come only from the farm. `critter_changed` and `status` are also phone
 * commands; the farm writes them after a safety removal of one, to restore the person's previous
 * critter, name, birthday or status.
 */
export const ON_BEHALF_KINDS = [
  'joined',
  'farm_opened',
  'hibernate',
  'gate',
  'traded',
  'critter_changed',
  'status',
] as const satisfies readonly EventKind[];

/**
 * Any event's envelope, with the payload unchecked. Sockets and paging carry events in this form so
 * one kind this app doesn't know never fails a batch.
 */
export const EventEnvelope = z
  .object({
    ...envelope,
    actor: PersonId.nullable(),
    kind: AnyEventKind,
    payload: z.unknown(),
  })
  .refine(hasDay, dayRule);
export type EventEnvelope = z.infer<typeof EventEnvelope>;

/** Where a check failed, as a path into the event. Carries no content. */
export type EventIssuePath = readonly (string | number)[];

/**
 * How a received event sorts:
 * - `known`: a kind this app knows, and it parses.
 * - `unknown`: a kind this app doesn't know. Store the envelope, step `lastSeq` past it, skip it
 *   in the reducer.
 * - `invalid`: a known kind (or a broken envelope) that fails. Store it raw, step `lastSeq` past
 *   it, report its kind, seq and issue paths (no content), then say `hello` again with
 *   `lastSeq: 0` to take the farm's snapshot.
 */
export type ParsedEvent =
  | { readonly status: 'known'; readonly event: FarmEvent }
  | { readonly status: 'unknown'; readonly event: EventEnvelope }
  | {
      readonly status: 'invalid';
      readonly raw: unknown;
      readonly kind: string | null;
      readonly seq: number | null;
      readonly issues: readonly EventIssuePath[];
    };

const knownKinds = new Set<string>(EVENT_KINDS);

/**
 * The paths of a parse failure. Inside a payload that may be a tombstone, the tombstone branch's
 * complaints are dropped, so the paths point at the real field (`['payload', 'answer']`).
 */
const pathsOf = (
  issues: readonly z.core.$ZodIssue[],
  base: readonly PropertyKey[],
): EventIssuePath[] =>
  issues.flatMap((issue) => {
    const path = [...base, ...issue.path];
    if (issue.code === 'invalid_union' && issue.errors.length > 0) {
      const real = issue.errors.filter((branch) => !branch.some((i) => i.path[0] === 'tombstone'));
      return (real.length > 0 ? real : issue.errors).flatMap((branch) => pathsOf(branch, path));
    }
    return [path.map((key) => (typeof key === 'symbol' ? String(key) : key))];
  });

const issuePaths = (error: z.ZodError): EventIssuePath[] => {
  const seen = new Map<string, EventIssuePath>();
  for (const path of pathsOf(error.issues, [])) seen.set(JSON.stringify(path), path);
  return [...seen.values()];
};

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/**
 * Sorts a received event. Phones use this; the farm object parses its own writes with the strict
 * `FarmEvent.parse` only.
 */
export const parseEvent = (value: unknown): ParsedEvent => {
  const envelope = EventEnvelope.safeParse(value);
  if (envelope.success && !knownKinds.has(envelope.data.kind)) {
    return { status: 'unknown', event: envelope.data };
  }
  const known = FarmEvent.safeParse(value);
  if (known.success) return { status: 'known', event: known.data };
  const kind = field(value, 'kind');
  const seq = field(value, 'seq');
  return {
    status: 'invalid',
    raw: value,
    kind: typeof kind === 'string' ? kind : null,
    seq: typeof seq === 'number' ? seq : null,
    issues: issuePaths(envelope.success ? known.error : envelope.error),
  };
};
