import { z } from 'zod';

import { AnyEventKind } from './events';
import {
  Critter,
  DisplayName,
  EpochMs,
  FarmId,
  FarmKind,
  FarmName,
  Id,
  PersonId,
  Seq,
  text,
} from './primitives';

/*
 * The cottage: one Durable Object per person, holding the chat list, Quick Tend and the push
 * budget. Farms tell it about new events; it tells the phone and the push queue.
 */

/** What a member's cottage hears about a newly committed event. */
export const CottageNotice = z.object({
  farm: FarmId,
  seq: Seq,
  kind: AnyEventKind,
  actor: PersonId.nullable(),
  at: EpochMs,
  /** A short line for the chat list; null when the event has no words to show. */
  preview: text(140).nullable(),
  /**
   * Meant for this member: a knock, a mention, a firefly, gift or slow post on their doorstep, or a
   * reply to them. The cottage decides pushes and Quick Tend from it.
   */
  forYou: z.boolean(),
});
export type CottageNotice = z.infer<typeof CottageNotice>;

/**
 * The farm object's call to each member's cottage after it commits an event. Only the farm knows
 * who has the farm open: `connected` is true when this member has a socket open to it. The
 * cottage decides from it whether to push, and enqueues the `PushJob`.
 */
export const CottageDelivery = CottageNotice.extend({ connected: z.boolean() });
export type CottageDelivery = z.infer<typeof CottageDelivery>;

/** The other person on a visit, drawn in place of a farm name. A deleted account has no name. */
export const VisitPeer = z.object({
  person: PersonId,
  name: DisplayName.nullable(),
  critter: Critter,
});
export type VisitPeer = z.infer<typeof VisitPeer>;

/** A visit has a peer and no name; a farm has a name and no peer. */
export const peerMatches = (visit: boolean, name: unknown, peer: unknown) =>
  visit === (peer !== null) && visit === (name === null);

/** One row of the chat list. `waiting` is how many things wait in Quick Tend. */
export const ChatListItem = CottageNotice.extend({
  farmKind: FarmKind,
  /** Null for a visit. */
  name: FarmName.nullable(),
  /** The other person, for a visit only. */
  with: VisitPeer.nullable(),
  waiting: z.int().min(0).max(99),
  muted: z.boolean(),
  pinned: z.boolean(),
}).refine((r) => peerMatches(r.farmKind === 'visit', r.name, r.with), {
  message: 'A visit has a peer and no name; a farm the opposite',
});
export type ChatListItem = z.infer<typeof ChatListItem>;

/**
 * The farm object's call to each member's cottage when the farm's row changes: on `joined`, a
 * rename, or a visit peer's change. `leaveFarm(farm)` drops the row on `left` or `removed`.
 */
export const CottageFarm = z
  .object({
    farm: FarmId,
    farmKind: FarmKind,
    name: FarmName.nullable(),
    with: VisitPeer.nullable(),
  })
  .refine((r) => peerMatches(r.farmKind === 'visit', r.name, r.with), {
    message: 'A visit has a peer and no name; a farm the opposite',
  });
export type CottageFarm = z.infer<typeof CottageFarm>;

/** A key into the notification catalogue, such as `push.knock`. */
export const CopyKey = z.string().regex(/^[a-z][a-zA-Z0-9_.]{0,63}$/);

/**
 * A message on the push queue, from the cottage to the push consumer. It carries the copy key and
 * its parameters, never rendered text: the consumer renders it in the person's language, checks
 * quiet hours and the budget again, sends, and writes the ledger. Jobs with the same
 * `collapseKey` fold into one push.
 */
export const PushJob = z.object({
  person: PersonId,
  /** Null for a nudge that belongs to no one farm. */
  farm: FarmId.nullable(),
  /** The event kind, or a nudge kind such as `nudge_back`. */
  kind: AnyEventKind,
  seq: Seq.nullable(),
  collapseKey: z.string().regex(/^[A-Za-z0-9_:.-]{1,64}$/),
  copy: z.object({
    key: CopyKey,
    params: z
      .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/), z.string().max(140))
      .refine((p) => Object.keys(p).length <= 10, { message: 'At most 10 parameters' }),
  }),
  forYou: z.boolean(),
  at: EpochMs,
});
export type PushJob = z.infer<typeof PushJob>;

/**
 * A push's `data`, as the app reads it when the push is opened: the farm and event to open, and
 * `push`, the cottage's id for this push, which the app sends back (`PushOpenedRequest`).
 */
export const PushData = z.object({
  farm: FarmId.nullable(),
  seq: Seq.nullable(),
  kind: AnyEventKind,
  push: Id,
});
export type PushData = z.infer<typeof PushData>;
