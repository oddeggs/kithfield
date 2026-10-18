import { z } from 'zod';

import { Departure, Id, PersonId, RuleRef, Seq } from '../primitives';
import { Crop } from './farm';

/**
 * The facts a tombstone keeps: only what the farm reducer reads for growth, caps, roses, the
 * doorstep, pins and plans, never content. Which keys each kind keeps is `TOMBSTONE_KEEPS`.
 */
export const TombstoneFacts = z
  .object({
    /** A firefly, gift or scrapbook action, or the gesture at a gate. */
    action: z.string().max(16),
    to: PersonId,
    person: PersonId,
    target: Seq,
    seed: Seq,
    option: z.int().min(0).max(13),
    on: z.boolean(),
    answer: z.enum(['in', 'maybe', 'out']),
    gift: Id,
    hat: PersonId,
    state: z.enum(['lit', 'sat', 'out']),
    how: Departure.exclude(['removed']),
    gave: Crop.nullable(),
    got: Crop.nullable(),
  })
  .partial();
export type TombstoneFacts = z.infer<typeof TombstoneFacts>;

/**
 * What an event's payload becomes after an unsend, a moderation removal or the author's account
 * deletion. The event keeps its seq and kind; its content is gone from every phone on next sync,
 * but the facts the reducer reads stay, so a phone catching up past it grows the farm the same.
 */
export const Tombstone = z.object({
  tombstone: z.enum(['unsent', 'removed', 'author_deleted']),
  /** The rule a moderation removal was made under. */
  rule: RuleRef.optional(),
  facts: TombstoneFacts.optional(),
});
export type Tombstone = z.infer<typeof Tombstone>;
