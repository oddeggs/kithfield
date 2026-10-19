/*
 * The farm reacting live to a message (signature motion): while the farm home is open, a friend's
 * new message lights their lamp in two drawings and pops a bubble with their words over their
 * cottage. A burst of messages makes one reaction every four seconds at most.
 */

/** A burst of messages reacts once in this long. */
export const REACT_EVERY_MS = 4000;
/** How long the bubble stays. */
export const SAID_MS = 2600;

/** An event as the reaction reads it. */
export interface ReactionEvent {
  readonly seq: number;
  readonly actor: string | null;
  readonly kind: string;
  readonly payload: unknown;
}

export interface FarmReaction {
  readonly key: string;
  readonly person: string;
  readonly text: string;
}

/** What has been reacted to: everything up to `afterSeq`, and when the last reaction was. */
export interface ReactedSoFar {
  readonly afterSeq: number;
  readonly lastAt: number | null;
}

/**
 * The reaction to the newest message a friend sent since `afterSeq`, if it is time for one, and
 * how far that reads. Your own words, other kinds and a burst inside four seconds make none.
 */
export function reactionTo(
  events: readonly ReactionEvent[],
  me: string | null,
  so: ReactedSoFar,
  now: number,
): { readonly reaction: FarmReaction | null; readonly afterSeq: number } {
  const fresh = events.filter((e) => e.seq > so.afterSeq);
  const afterSeq = fresh.reduce((top, e) => Math.max(top, e.seq), so.afterSeq);
  if (so.lastAt !== null && now - so.lastAt < REACT_EVERY_MS) return { reaction: null, afterSeq };
  const newest = fresh
    .filter((e) => e.kind === 'message' && e.actor !== null && e.actor !== me)
    .reduce<ReactionEvent | null>((a, e) => (a === null || e.seq > a.seq ? e : a), null);
  const text = (newest?.payload as { text?: unknown } | null | undefined)?.text;
  if (newest?.actor == null || typeof text !== 'string' || text.trim() === '') {
    return { reaction: null, afterSeq };
  }
  return { reaction: { key: String(newest.seq), person: newest.actor, text }, afterSeq };
}

/** The lamps a backdrop's key lights, and the rest of what it draws. */
function litOf(key: string): { lit: Set<string>; rest: string } | null {
  const at = key.indexOf('{');
  if (at < 0) return null;
  try {
    const req = JSON.parse(key.slice(at)) as { attrs?: { lit?: unknown } };
    const lit = typeof req.attrs?.lit === 'string' ? req.attrs.lit : '';
    const rest = JSON.stringify({ ...req, attrs: { ...req.attrs, lit: null } });
    return { lit: new Set(lit === 'none' ? [] : lit.split(',').filter(Boolean)), rest };
  } catch {
    return null;
  }
}

/** Whether going from one farm backdrop to the next only lights more lamps. */
export function lampsLit(beforeKey: string, afterKey: string): boolean {
  const before = litOf(beforeKey);
  const after = litOf(afterKey);
  if (!before || !after || before.rest !== after.rest) return false;
  if (after.lit.size <= before.lit.size) return false;
  return [...before.lit].every((l) => after.lit.has(l));
}
