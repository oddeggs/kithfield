import { z } from 'zod';

import { Ack, commandOptions, Rejection } from './commands';
import { ChatListItem } from './cottage';
import { EventEnvelope, RulesVersion } from './events';
import { Snapshot } from './snapshot';
import { LIMITS, PersonId } from './primitives';

/*
 * Sockets: JSON frames, one object per message, a union on `type`. The token goes in the first
 * frame, never in the URL.
 *
 * Order on the farm socket: after committing a write the farm broadcasts the new `event` to every
 * socket, the writer's included, then sends the writer its `ack`. A rejected write gets only
 * `rejected`.
 *
 * Keep-alive: the phone sends the string `PING` holds (`'ping'`) as a plain text message, and the
 * farm's hibernation auto-response answers with `PONG` (`'pong'`) without waking the object. They
 * are never JSON frames.
 */

export const PING = 'ping';
export const PONG = 'pong';

/** A frame type this app doesn't know. Parsed into this shape so clients can ignore it. */
export type UnknownFrame = { readonly type: 'unknown'; readonly received: string };

/** Accepts the known frames, and turns any other `type` into an `unknown` frame. */
const tolerant = <T extends z.ZodType>(known: T, types: readonly string[]) =>
  z.union([
    known,
    z
      .looseObject({ type: z.string().max(64) })
      .refine((f) => !types.includes(f.type), { message: 'A known frame type with a bad body' })
      .transform((f): UnknownFrame => ({ type: 'unknown', received: f.type })),
  ]);

const token = z.string().min(16).max(512);
/** The phone's protocol version; the server compares it and may answer `protocol_unsupported`. */
const protocol = z.int().min(1);

/* Farm socket: `GET /v1/farms/:id/socket`. */

export const FARM_CLIENT_FRAME_TYPES = ['hello', 'cmd', 'presence', 'typing'] as const;

const farmClientFrames = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocol,
    /** A 5-minute token from `POST /v1/rt-token`. */
    token,
    /** The last seq the phone holds; 0 when it holds nothing. */
    lastSeq: z.int().min(0),
    /**
     * The highest farm rules version this app's reducer implements. Below the farm's current
     * version the farm answers `error {rules_outdated}`; otherwise the phone catches up by events,
     * and a `rules_changed` event switches rules.
     */
    rulesVersion: RulesVersion,
  }),
  z.discriminatedUnion('kind', commandOptions({ type: z.literal('cmd') })),
  /** Never stored. Whether the farm is open in front of its person; drives `farm_opened`. */
  z.object({ type: z.literal('presence'), here: z.boolean() }),
  z.object({ type: z.literal('typing'), on: z.boolean() }),
]);

/** Frames a phone sends to its farm. */
export const FarmClientFrame = tolerant(farmClientFrames, FARM_CLIENT_FRAME_TYPES);
export type FarmClientFrame = z.infer<typeof FarmClientFrame>;

/**
 * Why a server closes a socket. `rules_outdated` and `protocol_unsupported` mean the app needs an
 * update (its outbox keeps its writes); `unauthorized` means fetch a new token and say hello again;
 * `session_ended` means this phone was signed out from another device (`DELETE /v1/devices/:id`),
 * and the app wipes what it holds as signing out does.
 */
export const SocketErrorCode = z.enum([
  'unauthorized',
  'session_ended',
  'not_member',
  'banned',
  'protocol_unsupported',
  'rules_outdated',
  'farm_gone',
]);
export type SocketErrorCode = z.infer<typeof SocketErrorCode>;

const errorFrame = z.object({ type: z.literal('error'), code: SocketErrorCode });

export const FARM_SERVER_FRAME_TYPES = [
  'snapshot',
  'events',
  'event',
  'ack',
  'rejected',
  'presence',
  'typing',
  'error',
] as const;

const farmServerFrames = z.discriminatedUnion('type', [
  /** Sent when the phone holds nothing or is more than 500 events behind. */
  Snapshot.extend({ type: z.literal('snapshot') }),
  /**
   * Catch-up after `lastSeq` (or after the snapshot), oldest first, at most 200 a batch. `more`
   * is false on the last batch; an empty last batch means the phone was already up to date.
   * Events are envelopes: sort each with `parseEvent`.
   */
  z.object({
    type: z.literal('events'),
    events: z.array(EventEnvelope).max(LIMITS.eventsBatch),
    more: z.boolean(),
  }),
  /** A new event from anyone, live. */
  z.object({ type: z.literal('event'), event: EventEnvelope }),
  Ack.extend({ type: z.literal('ack') }),
  Rejection.extend({ type: z.literal('rejected') }),
  /**
   * Everyone whose farm is open right now (their window is lit), and who is by the fire: from the
   * room (`LiveKitWebhook`), listening or talking alike, empty while the fire is out. Sent after
   * `hello` and whenever either changes. Never stored, and never how long anyone stayed. A farm
   * from before the fire room leaves `fire` out.
   */
  z.object({
    type: z.literal('presence'),
    here: z.array(PersonId).max(LIMITS.members),
    fire: z.array(PersonId).max(LIMITS.fireVoices).optional(),
  }),
  /** Everyone writing right now. */
  z.object({ type: z.literal('typing'), people: z.array(PersonId).max(LIMITS.members) }),
  errorFrame,
]);

/** Frames a farm sends to a phone. */
export const FarmServerFrame = tolerant(farmServerFrames, FARM_SERVER_FRAME_TYPES);
export type FarmServerFrame = z.infer<typeof FarmServerFrame>;

/* Cottage socket: one per person, for the chat list, badges and Quick Tend. */

export const COTTAGE_CLIENT_FRAME_TYPES = ['hello'] as const;

/** Frames a phone sends to its cottage. */
export const CottageClientFrame = tolerant(
  z.discriminatedUnion('type', [z.object({ type: z.literal('hello'), protocol, token })]),
  COTTAGE_CLIENT_FRAME_TYPES,
);
export type CottageClientFrame = z.infer<typeof CottageClientFrame>;

export const COTTAGE_SERVER_FRAME_TYPES = ['chats', 'chat', 'safety_note', 'error'] as const;

/** Frames a cottage sends to a phone. */
export const CottageServerFrame = tolerant(
  z.discriminatedUnion('type', [
    /** The whole chat list, sent after hello. */
    z.object({ type: z.literal('chats'), chats: z.array(ChatListItem).max(500) }),
    /** One row changed. */
    z.object({ type: z.literal('chat'), chat: ChatListItem }),
    /** A new note from the safety team: fetch `GET /v1/me/safety-notes`. Carries no content. */
    z.object({ type: z.literal('safety_note') }),
    errorFrame,
  ]),
  COTTAGE_SERVER_FRAME_TYPES,
);
export type CottageServerFrame = z.infer<typeof CottageServerFrame>;
