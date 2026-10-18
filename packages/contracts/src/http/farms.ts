import { z } from 'zod';

import { EventKindSchema, FarmEvent } from '../events';
import {
  ArtId,
  Critter,
  DisplayName,
  EpochMs,
  FarmId,
  FarmKind,
  FarmName,
  HttpUrl,
  LIMITS,
  PersonId,
  Role,
  Seq,
  Species,
  text,
} from '../primitives';

/*
 * `POST /v1/farms/:id/cmd` takes a `FarmCommand` and answers with a `CommandResult`
 * (both in commands.ts), with the same idempotency as the socket.
 */

/** `GET /v1/farms/:id/events?after=&before=&limit=`: query strings, coerced. */
export const EventsQuery = z
  .object({
    after: z.coerce.number().pipe(z.int().min(0)).optional(),
    before: z.coerce.number().pipe(Seq).optional(),
    limit: z.coerce.number().pipe(z.int().min(1).max(LIMITS.eventsBatch)).default(50),
  })
  .refine((q) => q.after === undefined || q.before === undefined || q.after < q.before, {
    message: '`after` must be below `before`',
  });
export type EventsQuery = z.infer<typeof EventsQuery>;

/** Oldest first. `more` says whether further events exist in the asked direction. */
export const EventsPage = z.object({
  events: z.array(FarmEvent).max(LIMITS.eventsBatch),
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
        kind: EventKindSchema,
        snippet: text(300),
      }),
    )
    .max(100),
});
export type SearchResults = z.infer<typeof SearchResults>;

/** `POST /v1/farms/:id/invites` answers with the farm's invite link; a new one retires the old. */
export const Invite = z.object({
  code: z.string().regex(/^[A-Za-z0-9-]{4,64}$/),
  url: HttpUrl,
  expiresAt: EpochMs.nullable(),
});
export type Invite = z.infer<typeof Invite>;

/** `POST /v1/farms`: plant a new farm (04-18). The creator becomes its keeper. */
export const CreateFarmRequest = z.object({
  name: FarmName,
  land: ArtId,
});
export type CreateFarmRequest = z.infer<typeof CreateFarmRequest>;

export const CreateFarmResponse = z.object({ farm: FarmId, invite: Invite });
export type CreateFarmResponse = z.infer<typeof CreateFarmResponse>;

/** `POST /v1/visits`: open (or reopen) the one-to-one visit with a person. */
export const OpenVisitRequest = z.object({ person: PersonId });
export type OpenVisitRequest = z.infer<typeof OpenVisitRequest>;
export const OpenVisitResponse = z.object({ farm: FarmId });
export type OpenVisitResponse = z.infer<typeof OpenVisitResponse>;

/** `GET /v1/farms`: the valley switcher (04-17). */
export const FarmList = z.object({
  farms: z
    .array(
      z.object({
        farm: FarmId,
        kind: FarmKind,
        name: FarmName,
        land: ArtId,
        role: Role,
        joinedAt: EpochMs,
      }),
    )
    .max(500),
});
export type FarmList = z.infer<typeof FarmList>;

export const CreateInviteRequest = z.object({
  /** How long the link works; null is always (11-07). */
  expiresAt: EpochMs.nullable(),
});
export type CreateInviteRequest = z.infer<typeof CreateInviteRequest>;

/** `GET /v1/invites/:code`: what the invite page and the app show before joining. */
export const InvitePreview = z.object({
  name: FarmName,
  land: ArtId,
  critters: z.array(Species).max(LIMITS.members),
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

/** `PUT /v1/farms/:id/notifications`: mute and what knocks for you (11-08). Nobody sees it. */
export const FarmNotifications = z.object({
  /** Muted until this time; null is not muted, `always` until turned back on. */
  mutedUntil: z.union([EpochMs, z.literal('always')]).nullable(),
  knockFor: z.object({
    plans: z.boolean(),
    doorstep: z.boolean(),
    mentions: z.boolean(),
    messages: z.boolean(),
  }),
});
export type FarmNotifications = z.infer<typeof FarmNotifications>;

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

/** `POST /v1/media/upload-url`. */
export const UploadUrlRequest = z.object({
  farm: FarmId,
  kind: z.enum(['photo', 'video', 'voice', 'file']),
  bytes: z.int().min(1).max(LIMITS.uploadBytes),
  mime: z.string().regex(/^[a-z]+\/[a-z0-9.+-]{1,80}$/),
});
export type UploadUrlRequest = z.infer<typeof UploadUrlRequest>;

const mediaKey = z.string().regex(/^farm\/[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}$/);

/** A single presigned PUT, or presigned parts above 50 MB. */
export const UploadUrlResponse = z.discriminatedUnion('upload', [
  z.object({
    upload: z.literal('single'),
    key: mediaKey,
    url: HttpUrl,
    expiresAt: EpochMs,
  }),
  z.object({
    upload: z.literal('multipart'),
    key: mediaKey,
    uploadId: z.string().min(1).max(512),
    partBytes: z.int().min(5 * 1024 * 1024),
    parts: z
      .array(z.object({ part: z.int().min(1), url: HttpUrl }))
      .min(1)
      .max(10_000),
    completeUrl: HttpUrl,
    expiresAt: EpochMs,
  }),
]);
export type UploadUrlResponse = z.infer<typeof UploadUrlResponse>;
