import { z } from 'zod';

import {
  ArtId,
  HttpUrl,
  LIMITS,
  MediaRef,
  PersonId,
  Reaction,
  RuleRef,
  Seq,
  text,
} from '../primitives';

/**
 * What an event's payload becomes after an unsend, a moderation removal or the author's account
 * deletion. The event keeps its seq and kind; its content is gone from every phone on next sync.
 */
export const Tombstone = z.object({
  tombstone: z.enum(['unsent', 'removed', 'author_deleted']),
  /** The rule a moderation removal was made under. */
  rule: RuleRef.optional(),
});
export type Tombstone = z.infer<typeof Tombstone>;

const replyTo = Seq.optional();

export const MessagePayload = z.object({
  text: text(LIMITS.message),
  replyTo,
  /** People mentioned with @; each is nudged once. */
  mentions: z.array(PersonId).max(LIMITS.members).optional(),
  /** Forwarded from another farm or visit (05-09). */
  forwarded: z.boolean().optional(),
});
export type MessagePayload = z.infer<typeof MessagePayload>;

/** Replaces a message's text. Allowed within 15 minutes of sending; that is a rule, not a schema. */
export const EditPayload = z.object({
  target: Seq,
  text: text(LIMITS.message),
});
export type EditPayload = z.infer<typeof EditPayload>;

export const UnsendCommandPayload = z.object({ target: Seq });
export type UnsendCommandPayload = z.infer<typeof UnsendCommandPayload>;

/** `by: safety` is a moderation removal written by the farm, with no person as actor. */
export const UnsendPayload = UnsendCommandPayload.extend({
  by: z.enum(['author', 'safety']),
});
export type UnsendPayload = z.infer<typeof UnsendPayload>;

/** One reaction per person per event; `null` takes it back. */
export const ReactionPayload = z.object({
  target: Seq,
  reaction: Reaction.nullable(),
});
export type ReactionPayload = z.infer<typeof ReactionPayload>;

export const StickerPayload = z.object({
  pack: ArtId,
  sticker: ArtId,
  /** Friends drawn into a together sticker (08-02). */
  with: z.array(PersonId).min(1).max(LIMITS.stickerFriends).optional(),
  replyTo,
});
export type StickerPayload = z.infer<typeof StickerPayload>;

/** Photos, video, doodles and files. Grows Pictures. */
export const MediaPayload = z.object({
  items: z.array(MediaRef).min(1).max(LIMITS.mediaItems),
  caption: text(LIMITS.message).optional(),
  doodle: z.boolean().optional(),
  replyTo,
});
export type MediaPayload = z.infer<typeof MediaPayload>;

export const VoicePayload = z.object({
  audio: MediaRef,
  durationMs: z.int().min(1).max(LIMITS.voiceMs),
  /** Levels 0–255 for the drawn waveform. */
  waveform: z.array(z.int().min(0).max(255)).max(LIMITS.waveform),
  replyTo,
});
export type VoicePayload = z.infer<typeof VoicePayload>;

/** A link; its preview is fetched on the sender's phone (04-15). */
export const LinkPayload = z.object({
  url: HttpUrl,
  text: text(LIMITS.message).optional(),
  preview: z
    .object({
      title: text(200).optional(),
      description: text(500).optional(),
      site: text(100).optional(),
      image: MediaRef.optional(),
    })
    .optional(),
  replyTo,
});
export type LinkPayload = z.infer<typeof LinkPayload>;

/** Pins a message to the cork board, or takes it down. Up to 10; the oldest drops off (04-10). */
export const PinPayload = z.object({
  target: Seq,
  on: z.boolean(),
});
export type PinPayload = z.infer<typeof PinPayload>;
