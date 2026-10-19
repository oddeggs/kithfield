import { z } from 'zod';

import { Lang, LIMITS, Seq, text } from '../primitives';
import { LanguageTag } from './fire';

/*
 * What the AI features answer over HTTP. Every one is behind the person's consent
 * (`PUT /v1/me/consents/:feature`, `AiFeature`), asked before anything is sent. The provider is
 * Cloudflare Workers AI. The fire's live captions travel on the room (`FireCaptionLine`); the
 * Sunday recap is a `WeeklyRecap`; the jobs behind them are on the `ai` queue (`AiJob`).
 */

/**
 * `POST /v1/farms/:id/voice/:seq/caption`: ask for a voice note's caption, translated into `lang`
 * when it was said in another. Answers `VoiceCaption`; while `pending`, `GET` the same path for it.
 */
export const VoiceCaptionRequest = z.object({ lang: Lang });
export type VoiceCaptionRequest = z.infer<typeof VoiceCaptionRequest>;

/**
 * A voice note's caption. `not_allowed`: its author hasn't said yes to `voice_notes`, so it is
 * never sent and the caption shows as a quiet "…". `failed` may be asked for again later. A
 * caption goes when its voice note is unsent or its author withdraws consent.
 */
export const VoiceCaption = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ready'),
    seq: Seq,
    said: LanguageTag,
    text: text(LIMITS.captionText),
    translation: z.object({ lang: Lang, text: text(LIMITS.captionText) }).nullable(),
  }),
  z.object({ state: z.literal('pending'), seq: Seq }),
  z.object({ state: z.literal('not_allowed'), seq: Seq }),
  z.object({ state: z.literal('failed'), seq: Seq }),
]);
export type VoiceCaption = z.infer<typeof VoiceCaption>;
