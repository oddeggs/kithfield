import { z } from 'zod';

import { peerMatches, VisitPeer } from '../cottage';
import { AnyEventKind, EventEnvelope, EventKindSchema } from '../events';
import { GateGesture } from '../payloads/care';
import { SeasonRef } from '../payloads/farm';
import {
  ArtId,
  Critter,
  DisplayName,
  EpochMs,
  FarmId,
  FarmKind,
  FarmName,
  Hemisphere,
  HttpUrl,
  LIMITS,
  OpId,
  PersonId,
  PlantId,
  Role,
  Seq,
  TimeZone,
  text,
} from '../primitives';

/*
 * `POST /v1/farms/:id/cmd` takes a `FarmCommand` and answers with a `CommandResult`
 * (both in commands.ts), with the same idempotency as the socket.
 */

/** A non-negative whole number written plainly in a query string: no `1e3`, no blanks. */
const queryInt = z
  .string()
  .regex(/^(0|[1-9]\d{0,14})$/)
  .transform(Number);

/**
 * `GET /v1/farms/:id/events?after=&before=&limit=&kinds=`: paging history. With `after`, the page
 * starts just after it; with `before`, it ends just before it; with neither, it is the newest page.
 * `kinds` is a comma-separated filter, such as `media,link` for shared media.
 */
export const EventsQuery = z
  .object({
    after: queryInt.pipe(z.int().min(0)).optional(),
    before: queryInt.pipe(Seq).optional(),
    limit: queryInt.pipe(z.int().min(1).max(LIMITS.eventsBatch)).default(50),
    kinds: z
      .string()
      .regex(/^[a-z][a-z0-9_]*(,[a-z][a-z0-9_]*)*$/)
      .transform((s) => s.split(','))
      .pipe(z.array(EventKindSchema).min(1).max(40))
      .optional(),
  })
  .refine((q) => q.after === undefined || q.before === undefined || q.after < q.before, {
    message: '`after` must be below `before`',
  });
export type EventsQuery = z.infer<typeof EventsQuery>;

/** Oldest first; events are envelopes, sorted with `parseEvent`. `more` says whether further events exist in the asked direction. */
export const EventsPage = z.object({
  events: z.array(EventEnvelope).max(LIMITS.eventsBatch),
  more: z.boolean(),
});
export type EventsPage = z.infer<typeof EventsPage>;

/** `GET /v1/farms/:id/search?q=`, full-text inside the farm object. */
export const SearchQuery = z.object({ q: text(100) });
export type SearchQuery = z.infer<typeof SearchQuery>;

export const SearchResults = z.object({
  results: z
    .array(
      z.object({
        seq: Seq,
        at: EpochMs,
        actor: PersonId.nullable(),
        kind: AnyEventKind,
        snippet: text(300),
      }),
    )
    .max(100),
});
export type SearchResults = z.infer<typeof SearchResults>;

/**
 * `POST /v1/farms/:id/invites` answers with the farm's invite link; a new one retires the old.
 * Keepers and helpers only.
 */
export const Invite = z.object({
  code: z.string().regex(/^[A-Za-z0-9-]{4,64}$/),
  url: HttpUrl,
  expiresAt: EpochMs.nullable(),
});
export type Invite = z.infer<typeof Invite>;

/**
 * `GET /v1/farms/:id/invite`: the farm's current link for the invite screen, or null when there is
 * none (taken back or expired). Keepers and helpers only, so the server keeps the code readable to
 * them, not only its hash.
 */
export const CurrentInvite = z.object({ invite: Invite.nullable() });
export type CurrentInvite = z.infer<typeof CurrentInvite>;

/** The farm's calendar, from the creator's device settings, never their location. */
const calendar = { timeZone: TimeZone, hemisphere: Hemisphere };

/** `POST /v1/farms`: plant a new farm. The creator becomes its keeper. */
export const CreateFarmRequest = z.object({ name: FarmName, land: ArtId, ...calendar });
export type CreateFarmRequest = z.infer<typeof CreateFarmRequest>;

export const CreateFarmResponse = z.object({ farm: FarmId, invite: Invite });
export type CreateFarmResponse = z.infer<typeof CreateFarmResponse>;

/** `POST /v1/visits`: open (or reopen) the one-to-one visit with a person. */
export const OpenVisitRequest = z.object({ person: PersonId, ...calendar });
export type OpenVisitRequest = z.infer<typeof OpenVisitRequest>;
export const OpenVisitResponse = z.object({ farm: FarmId });
export type OpenVisitResponse = z.infer<typeof OpenVisitResponse>;

/** `GET /v1/farms`: the valley switcher. A visit has no name; it shows the other person. */
export const FarmList = z.object({
  farms: z
    .array(
      z
        .object({
          farm: FarmId,
          kind: FarmKind,
          name: FarmName.nullable(),
          with: VisitPeer.nullable(),
          land: ArtId,
          role: Role,
          joinedAt: EpochMs,
        })
        .refine((r) => peerMatches(r.kind === 'visit', r.name, r.with), {
          message: 'A visit has a peer and no name; a farm the opposite',
        }),
    )
    .max(500),
});
export type FarmList = z.infer<typeof FarmList>;

export const CreateInviteRequest = z.object({
  /** How long the link works; null is always. */
  expiresAt: EpochMs.nullable(),
});
export type CreateInviteRequest = z.infer<typeof CreateInviteRequest>;

/**
 * `GET /v1/invites/:code` (public, no session): what the invite page and the app show before
 * joining. 200 with this, also when the farm is full (`full`); 404 `invite_invalid` for a link
 * that is unknown, taken back, expired or used up, or a farm that is gone. Joining answers 404
 * `invite_invalid` the same way and 409 `farm_full`. `from` is who made the link, null once they
 * have left or deleted their account.
 */
export const InvitePreview = z.object({
  name: FarmName,
  from: z.object({ name: DisplayName, critter: Critter }).nullable(),
  land: ArtId,
  critters: z.array(Critter).max(LIMITS.members),
  full: z.boolean(),
  approval: z.boolean(),
});
export type InvitePreview = z.infer<typeof InvitePreview>;

/** `POST /v1/invites/:code/join`. */
export const JoinRequest = z.object({ name: DisplayName, critter: Critter });
export type JoinRequest = z.infer<typeof JoinRequest>;

export const JoinResponse = z.object({
  farm: FarmId,
  status: z.enum(['joined', 'waiting_for_keeper']),
});
export type JoinResponse = z.infer<typeof JoinResponse>;

/** `GET /v1/farms/:id/waiting`: people waiting for a keeper to let them in. Keepers only. */
export const WaitingList = z.object({
  waiting: z
    .array(z.object({ person: PersonId, name: DisplayName, critter: Critter, askedAt: EpochMs }))
    .max(100),
});
export type WaitingList = z.infer<typeof WaitingList>;

/** `POST /v1/farms/:id/waiting/:person`: let them in (the farm writes `joined`) or not, quietly. */
export const ApprovalRequest = z.object({ approve: z.boolean() });
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;

/** `PUT /v1/farms/:id/notifications`: mute and what knocks for you. Nobody sees it. 204. */
export const FarmNotifications = z.object({
  /** Muted until this time; null is not muted, `always` until turned back on. */
  mutedUntil: z.union([EpochMs, z.literal('always')]).nullable(),
  knockFor: z.object({
    plans: z.boolean(),
    doorstep: z.boolean(),
    mentions: z.boolean(),
    messages: z.boolean(),
    /**
     * A rare variant opening on the farm, at most one a week. Off unless turned on; absent reads
     * as off. It never rests, so it isn't a `NotificationType`.
     */
    rareBlooms: z.boolean().optional(),
  }),
});
export type FarmNotifications = z.infer<typeof FarmNotifications>;

/** The kinds of push a farm may send one person, as the notification settings name them. */
export const NotificationType = z.enum([
  'plans',
  'doorstep',
  'mentions',
  'messages',
  'birthdays',
  'nudges',
]);
export type NotificationType = z.infer<typeof NotificationType>;

/**
 * `GET /v1/farms/:id/notifications`: the settings, plus the kinds resting after three pushes of a
 * kind went unopened, and until when. `DELETE /v1/farms/:id/notifications/resting/:type` turns one
 * back on (204).
 */
export const FarmNotificationsView = FarmNotifications.extend({
  resting: z.array(z.object({ type: NotificationType, until: EpochMs })).max(6),
});
export type FarmNotificationsView = z.infer<typeof FarmNotificationsView>;

/** `POST /v1/farms/:id/fire-token`: a LiveKit token for the fire room. Listening never opens the mic. */
export const FireTokenRequest = z.object({ mode: z.enum(['join', 'listen']) });
export type FireTokenRequest = z.infer<typeof FireTokenRequest>;

export const FireTokenResponse = z.object({
  url: z.url({ protocol: /^wss?$/ }),
  room: text(128),
  token: z.string().min(16).max(4096),
  expiresAt: EpochMs,
});
export type FireTokenResponse = z.infer<typeof FireTokenResponse>;

/* Visiting another farm */

/**
 * `GET /v1/farms/:id/gate`: what a visitor from another farm sees at the gate: its season, what
 * grows, its signature crop and who lives there. Never its chat.
 */
export const FarmGate = z.object({
  farm: FarmId,
  name: FarmName,
  land: ArtId,
  theme: ArtId.nullable(),
  hemisphere: Hemisphere,
  season: SeasonRef,
  signature: PlantId.nullable(),
  inSeason: z.array(PlantId).max(7),
  critters: z
    .array(z.object({ person: PersonId, name: DisplayName, critter: Critter }))
    .max(LIMITS.members),
});
export type FarmGate = z.infer<typeof FarmGate>;

/**
 * `GET /v1/gates`: the farms this person may visit, friends of friends: farms (never visits) where
 * someone they share a farm with lives, and which they don't live on. `friends` are the people
 * they know there. Blocks and removals apply as at the gate. `?person=` narrows it to the farms of
 * one friend, for their critter card.
 */
export const GateList = z.object({
  gates: z
    .array(
      z.object({
        farm: FarmId,
        name: FarmName,
        land: ArtId,
        season: SeasonRef,
        signature: PlantId.nullable(),
        friends: z.array(PersonId).min(1).max(LIMITS.members),
      }),
    )
    .max(200),
});
export type GateList = z.infer<typeof GateList>;

/**
 * `POST /v1/farms/:id/gate`: wave, leave a firefly or a gift at another farm's gate. That farm
 * writes a `gate` event with the visitor as actor. Answers with a `CommandResult`.
 */
export const GateRequest = z.object({ opId: OpId, gesture: GateGesture });
export type GateRequest = z.infer<typeof GateRequest>;

/**
 * `POST /v1/farms/:id/trade`, where `:id` is the farm being visited: one bundle for one, once per
 * visit, when both farms have the crop at harvest. `give` is null to just take some home. Answers
 * with a `CommandResult` whose seq is the `traded` event on the visitor's own farm.
 */
export const TradeRequest = z.object({
  opId: OpId,
  from: FarmId,
  /** The member of the visited farm met at the gate. */
  with: PersonId,
  give: PlantId.nullable(),
  take: PlantId,
});
export type TradeRequest = z.infer<typeof TradeRequest>;
