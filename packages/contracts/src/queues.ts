import { z } from 'zod';

import { EpochMs, FarmId, Lang, LocalDate, MediaKey, PersonId, Seq } from './primitives';

/*
 * Messages on the queues that aren't push jobs (`PushJob` is in cottage.ts).
 */

/**
 * On the `deletion` queue: an anonymous person signed in to an account that already had a person,
 * and `from` was merged `into` it. Farms and cottages move what they key by person (memberships,
 * snapshot members, cottage rows, devices, remember-me seeds) from `from` to `into`. Past events
 * are not rewritten: their actor stays `from`, and readers map it to `into`.
 */
export const PersonMergedJob = z.object({
  kind: z.literal('person_merged'),
  from: PersonId,
  into: PersonId,
  at: EpochMs,
});
export type PersonMergedJob = z.infer<typeof PersonMergedJob>;

/**
 * On the `ai` queue: write a farm's Sunday recap letter for the week ending on `week` (a Sunday,
 * farm time), in each language its members read, from the text of that week's messages by members
 * who said yes to `recap`, read when the job runs. With nobody saying yes, no job is queued.
 */
export const RecapJob = z.object({
  kind: z.literal('recap'),
  farm: FarmId,
  week: LocalDate,
  langs: z.array(Lang).min(1).max(2),
  at: EpochMs,
});
export type RecapJob = z.infer<typeof RecapJob>;

/**
 * On the `ai` queue: caption a voice note whose author said yes to `voice_notes`, and translate it
 * into `lang` when it was said in another. Consent is checked again when the job runs.
 */
export const VoiceCaptionJob = z.object({
  kind: z.literal('voice_caption'),
  farm: FarmId,
  seq: Seq,
  audio: MediaKey,
  author: PersonId,
  lang: Lang,
  at: EpochMs,
});
export type VoiceCaptionJob = z.infer<typeof VoiceCaptionJob>;

/** Every message on the `ai` queue. */
export const AiJob = z.discriminatedUnion('kind', [RecapJob, VoiceCaptionJob]);
export type AiJob = z.infer<typeof AiJob>;
