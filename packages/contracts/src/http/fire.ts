import { z } from 'zod';

import { type FarmId, LIMITS, PersonId, text } from '../primitives';

/*
 * The fire room runs on LiveKit. `POST /v1/farms/:id/fire-token` (`FireTokenRequest`, in farms.ts)
 * mints a token for the room `fireRoomOf(farm)`, with the person id as identity and the attributes
 * below. The farm hears who sits down and heads home from LiveKit's webhook (`LiveKitWebhook`) and
 * tells phones in the `presence` frame (`fire`). Nothing is recorded, and nobody sees how long
 * anyone stayed.
 */

/** A farm's fire room. */
export const FireRoom = z.string().regex(/^fire-[A-Za-z0-9_-]{1,64}$/);
export type FireRoom = z.infer<typeof FireRoom>;

export const fireRoomOf = (farm: FarmId): FireRoom => `fire-${farm}`;

/** The farm a fire room belongs to, or null for a name that isn't one. */
export const farmOfFireRoom = (room: string): FarmId | null =>
  FireRoom.safeParse(room).success ? room.slice('fire-'.length) : null;

/** A language a caption was said or translated in, as a BCP 47 primary tag (`en`, `vi`, `fr`). */
export const LanguageTag = z.string().regex(/^[a-z]{2,3}$/);
export type LanguageTag = z.infer<typeof LanguageTag>;

/**
 * Each participant's LiveKit attributes (a map of strings). The server sets `mode` and `captionsOk`
 * in the token, from the request and the person's `captions` consent; the phone updates `lantern`
 * and `captionsIn` as they change.
 */
export const FireAttributes = z.object({
  /** Joined in, or just listening (the mic never opens). */
  mode: z.enum(['join', 'listen']),
  /** This speaker said yes to captions: only their voice is ever captioned. */
  captionsOk: z.enum(['yes', 'no']),
  /** This listener has captions on (a patron perk), in this language; absent when off. */
  captionsIn: LanguageTag.optional(),
  /** Their lantern (camera) is lit. */
  lantern: z.enum(['on', 'off']),
});
export type FireAttributes = z.infer<typeof FireAttributes>;

/** The LiveKit data topic caption lines travel on. */
export const FIRE_CAPTION_TOPIC = 'captions';

/** A non-negative whole number written plainly in a query string. */
const queryInt = z
  .string()
  .regex(/^(0|[1-9]\d{0,14})$/)
  .transform(Number);

/**
 * `POST /v1/farms/:id/fire/captions?chunk=&startedAt=`: one piece of the speaker's own audio (the
 * body, `audio/wav` or `audio/mp4`, at most `LIMITS.captionChunkMs` long and
 * `LIMITS.captionChunkBytes`), sent only while they consent and someone in the room has captions
 * on. 403 `forbidden` without the speaker's consent. Answers `FireCaptionChunkResponse`.
 */
export const FireCaptionChunkQuery = z.object({
  chunk: queryInt.pipe(z.int().min(0)),
  startedAt: queryInt.pipe(z.int().min(0)),
});
export type FireCaptionChunkQuery = z.infer<typeof FireCaptionChunkQuery>;

/** Whether anyone still has captions on; when not, the phone stops sending. */
export const FireCaptionChunkResponse = z.object({ listening: z.boolean() });
export type FireCaptionChunkResponse = z.infer<typeof FireCaptionChunkResponse>;

/**
 * A caption line, published by the server on `FIRE_CAPTION_TOPIC` only to participants with
 * captions on, each with the translation into their language when it was said in another. Never
 * stored: captions vanish when the fire goes out. A speaker who said no has no lines; their
 * captions show as a quiet "…".
 */
export const FireCaptionLine = z.object({
  speaker: PersonId,
  chunk: z.int().min(0),
  said: LanguageTag,
  text: text(LIMITS.captionText),
  translation: z.object({ lang: LanguageTag, text: text(LIMITS.captionText) }).nullable(),
});
export type FireCaptionLine = z.infer<typeof FireCaptionLine>;
