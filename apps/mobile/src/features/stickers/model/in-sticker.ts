/** A farm event as the note reads it. */
export interface NoteEvent {
  readonly seq: number;
  readonly kind: string;
  readonly actor: string | null;
  readonly payload: unknown;
}

/**
 * The first together sticker someone else drew you into, for the one "you're in a sticker" note:
 * null once the note has been shown, or when there is none.
 */
export function firstInSticker(
  events: readonly NoteEvent[],
  me: string | null,
  noted: boolean,
): NoteEvent | null {
  if (noted || me === null) return null;
  for (const e of events) {
    if (e.kind !== 'sticker' || e.actor === null || e.actor === me) continue;
    const drawn = (e.payload as { with?: unknown } | null)?.with;
    if (Array.isArray(drawn) && drawn.includes(me)) return e;
  }
  return null;
}
