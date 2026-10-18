import { z } from 'zod';

import { Ack, commandOptions, Rejection } from './commands';
import { EventKindSchema, FarmEvent, RulesVersion } from './events';
import { Snapshot } from './snapshot';
import {
  EpochMs,
  FarmId,
  FarmKind,
  FarmName,
  LIMITS,
  PersonId,
  PROTOCOL_VERSION,
  Seq,
  text,
} from './primitives';

/*
 * Farm socket: JSON frames over `GET /v1/farms/:id/socket`, one object per message, a union on
 * `type`. The token goes in the first frame, never in the URL.
 */

const hello = z.object({
  type: z.literal('hello'),
  protocol: z.literal(PROTOCOL_VERSION),
  /** A 5-minute token from `POST /v1/rt-token`. */
  token: z.string().min(16).max(512),
  /** The last seq the phone holds; 0 when it holds nothing. */
  lastSeq: z.int().min(0),
  rulesVersion: RulesVersion,
});

/** Never stored. A phone says whether the farm is open in front of its person. */
const presenceUp = z.object({ type: z.literal('presence'), here: z.boolean() });
const typingUp = z.object({ type: z.literal('typing'), on: z.boolean() });

/** Frames a phone sends to its farm. */
export const FarmClientFrame = z.discriminatedUnion('type', [
  hello,
  z.discriminatedUnion('kind', commandOptions({ type: z.literal('cmd') })),
  presenceUp,
  typingUp,
]);
export type FarmClientFrame = z.infer<typeof FarmClientFrame>;

/**
 * Why a farm closes a socket. `rules_outdated` and `protocol_unsupported` mean the app needs an
 * update; `unauthorized` means fetch a new token and say hello again.
 */
export const SocketErrorCode = z.enum([
  'unauthorized',
  'not_member',
  'banned',
  'protocol_unsupported',
  'rules_outdated',
  'farm_gone',
]);
export type SocketErrorCode = z.infer<typeof SocketErrorCode>;

const errorFrame = z.object({ type: z.literal('error'), code: SocketErrorCode });

/** Frames a farm sends to a phone. */
export const FarmServerFrame = z.discriminatedUnion('type', [
  /** Sent when the phone holds nothing, is more than 500 events behind, or has older rules. */
  Snapshot.extend({ type: z.literal('snapshot') }),
  /**
   * Catch-up after `lastSeq` (or after the snapshot), oldest first, at most 200 a batch. `more`
   * is false on the last batch; an empty last batch means the phone was already up to date.
   */
  z.object({
    type: z.literal('events'),
    events: z.array(FarmEvent).max(LIMITS.eventsBatch),
    more: z.boolean(),
  }),
  /** A new event from anyone, live. */
  z.object({ type: z.literal('event'), event: FarmEvent }),
  Ack.extend({ type: z.literal('ack') }),
  Rejection.extend({ type: z.literal('rejected') }),
  /** Everyone whose farm is open right now (their window is lit). */
  z.object({ type: z.literal('presence'), here: z.array(PersonId).max(LIMITS.members) }),
  /** Everyone writing right now. */
  z.object({ type: z.literal('typing'), people: z.array(PersonId).max(LIMITS.members) }),
  errorFrame,
]);
export type FarmServerFrame = z.infer<typeof FarmServerFrame>;

/*
 * Cottage socket: one per person, for the chat list, badges and Quick Tend.
 */

/** The farm's note to each member's cottage after it commits an event. */
export const CottageNotice = z.object({
  farm: FarmId,
  seq: Seq,
  kind: EventKindSchema,
  actor: PersonId.nullable(),
  at: EpochMs,
  /** A short line for the chat list; null when the event has no words to show. */
  preview: text(140).nullable(),
});
export type CottageNotice = z.infer<typeof CottageNotice>;

/** One row of the chat list (04-02). `waiting` is how many things wait in Quick Tend. */
export const ChatListItem = CottageNotice.extend({
  farmKind: FarmKind,
  name: FarmName,
  waiting: z.int().min(0).max(99),
  muted: z.boolean(),
  pinned: z.boolean(),
});
export type ChatListItem = z.infer<typeof ChatListItem>;

export const CottageClientFrame = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocol: z.literal(PROTOCOL_VERSION),
    token: z.string().min(16).max(512),
  }),
]);
export type CottageClientFrame = z.infer<typeof CottageClientFrame>;

export const CottageServerFrame = z.discriminatedUnion('type', [
  /** The whole chat list, sent after hello. */
  z.object({ type: z.literal('chats'), chats: z.array(ChatListItem).max(500) }),
  /** One row changed. */
  z.object({ type: z.literal('chat'), chat: ChatListItem }),
  errorFrame,
]);
export type CottageServerFrame = z.infer<typeof CottageServerFrame>;
