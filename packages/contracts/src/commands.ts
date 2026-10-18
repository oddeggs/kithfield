import { z } from 'zod';

import {
  CardSignedPayload,
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
  SlowPostCommandPayload,
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
  UnsendCommandPayload,
  VoicePayload,
} from './payloads/chat';
import {
  CritterChangedPayload,
  FireCommandPayload,
  LeftCommandPayload,
  RemovedCommandPayload,
  SettingsCommandPayload,
  StatusPayload,
} from './payloads/farm';
import { OpId, Seq } from './primitives';

/**
 * Every write a phone can make, as `{opId, kind, payload}`. The same list builds the socket's `cmd`
 * frame (with `type: 'cmd'` added) and the HTTP command body.
 */
export const commandOptions = <E extends z.ZodRawShape>(extra: E) => {
  const c = <K extends string, P extends z.ZodType>(kind: K, payload: P) =>
    z.object({ ...extra, opId: OpId, kind: z.literal(kind), payload });
  return [
    c('message', MessagePayload),
    c('edit', EditPayload),
    c('unsend', UnsendCommandPayload),
    c('reaction', ReactionPayload),
    c('sticker', StickerPayload),
    c('media', MediaPayload),
    c('voice', VoicePayload),
    c('link', LinkPayload),
    c('pin', PinPayload),
    c('dewdrop', DewdropPayload),
    c('firefly', FireflyPayload),
    c('wave', WavePayload),
    c('knock', KnockPayload),
    c('hug', HugPayload),
    c('quiet_note', QuietNotePayload),
    c('slow_post', SlowPostCommandPayload),
    c('card_signed', CardSignedPayload),
    c('seed_planted', SeedPlantedPayload),
    c('seed_changed', SeedChangedPayload),
    c('vote', VotePayload),
    c('rsvp', RsvpPayload),
    c('checkin', CheckinPayload),
    c('gift', GiftPayload),
    c('scrapbook_page', ScrapbookPagePayload),
    c('status', StatusPayload),
    c('fire', FireCommandPayload),
    c('left', LeftCommandPayload),
    c('removed', RemovedCommandPayload),
    c('critter_changed', CritterChangedPayload),
    c('settings_changed', SettingsCommandPayload),
  ] as const;
};

/** A write, applied once per `opId`. Also the body of `POST /v1/farms/:id/cmd`. */
export const FarmCommand = z.discriminatedUnion('kind', commandOptions({}));
export type FarmCommand = z.infer<typeof FarmCommand>;
export type CommandKind = FarmCommand['kind'];
export type CommandOf<K extends CommandKind> = Extract<FarmCommand, { kind: K }>;

export const COMMAND_KINDS: readonly CommandKind[] = FarmCommand.options.map(
  (o) => o.shape.kind.value,
);

/**
 * Why a write was refused. A rejection is final: the outbox drops the write and the UI explains.
 * A duplicate `opId` is answered with its original outcome: an applied write is acked again with
 * its original seq, and a rejected write stays rejected with its original reason, so the farm
 * stores rejected op ids too. A phone whose app is too old gets a socket `error` instead, and its
 * outbox keeps the write.
 */
export const RejectReason = z.enum([
  /** The payload failed the schema or a farm rule. */
  'invalid',
  'not_member',
  /** The writer's role or authorship doesn't allow it (keeper-only settings, editing others). */
  'not_allowed',
  /** The target seq doesn't exist, or isn't something this write can point at. */
  'not_found',
  /** The target was unsent or removed. */
  'gone',
  /** Edits are allowed for 15 minutes. */
  'edit_window_closed',
  /** A per-day limit, such as one knock per friend per day. */
  'limit_reached',
  /** The other person can't receive this (no reason is ever shown). */
  'unavailable',
  'farm_full',
  'farm_frozen',
  /** The writer is paused by the safety team: can read, can't post. */
  'account_paused',
]);
export type RejectReason = z.infer<typeof RejectReason>;

export const Ack = z.object({ opId: OpId, seq: Seq });
export type Ack = z.infer<typeof Ack>;

export const Rejection = z.object({ opId: OpId, reason: RejectReason });
export type Rejection = z.infer<typeof Rejection>;

/**
 * The HTTP command response. On the socket the farm first broadcasts the new `event` to every
 * socket, the writer's included, then sends the writer its `ack` (or just `rejected`).
 */
export const CommandResult = z.discriminatedUnion('result', [
  Ack.extend({ result: z.literal('ack') }),
  Rejection.extend({ result: z.literal('rejected') }),
]);
export type CommandResult = z.infer<typeof CommandResult>;
