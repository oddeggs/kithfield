import { FireCaptionLine } from '@kithfield/contracts';

/*
 * The captions under the fire: the last few lines, newest last, on this phone only. They are never
 * kept: they go when the room closes. A speaker who said no to captions shows as a quiet "…".
 */

export type CaptionRow =
  | { readonly kind: 'line'; readonly line: FireCaptionLine }
  | { readonly kind: 'withheld'; readonly speaker: string };

/** How many lines show at once. */
export const SHOWN_LINES = 3;

/** A caption line from the room's data topic, or null for anything that isn't one. */
export function lineFrom(payload: Uint8Array): FireCaptionLine | null {
  try {
    const parsed = FireCaptionLine.safeParse(JSON.parse(new TextDecoder().decode(payload)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const keyOf = (row: CaptionRow) =>
  row.kind === 'line' ? `${row.line.speaker}:${row.line.chunk}` : `${row.speaker}:withheld`;

/**
 * The rows after a new one: a line replaces an earlier copy of the same piece; a speaker's run of
 * lines stays in order; the oldest drop off past `SHOWN_LINES`.
 */
export function addRow(rows: readonly CaptionRow[], row: CaptionRow): CaptionRow[] {
  const key = keyOf(row);
  const rest = rows.filter((r) => {
    if (keyOf(r) === key) return false;
    // A line from a speaker replaces their "…": they're captioned after all.
    return !(row.kind === 'line' && r.kind === 'withheld' && r.speaker === row.line.speaker);
  });
  return [...rest, row].slice(-SHOWN_LINES);
}
