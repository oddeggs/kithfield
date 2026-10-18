import type { EventEnvelope, FarmCommand, RejectReason } from '@kithfield/contracts';

/*
 * The one log check the farm rules leave to the object: what a write points at must be something
 * said in the chat. The rules check that targets exist and are still there, authorship, the edit
 * window, slow-post recall and the daily limits (given the log through `CommandContext`).
 */

/** What reactions, pins, dewdrops and replies can point at. */
const CHAT_KINDS = new Set(['message', 'sticker', 'media', 'voice', 'link', 'quiet_note']);

type Lookup = (seq: number) => EventEnvelope | null;

const chatTarget = (lookup: Lookup, seq: number | undefined): RejectReason | null => {
  if (seq === undefined) return null;
  const target = lookup(seq);
  return target === null || !CHAT_KINDS.has(target.kind) ? 'not_found' : null;
};

export const checkTargets = (cmd: FarmCommand, lookup: Lookup): RejectReason | null => {
  const reply = (cmd.payload as { replyTo?: unknown }).replyTo;
  if (typeof reply === 'number') {
    const missing = chatTarget(lookup, reply);
    if (missing !== null) return missing;
  }
  if (cmd.kind === 'reaction' || cmd.kind === 'pin' || cmd.kind === 'dewdrop') {
    return chatTarget(lookup, cmd.payload.target);
  }
  return null;
};
