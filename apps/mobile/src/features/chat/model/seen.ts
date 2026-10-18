/*
 * How far this phone has looked at each chat: kept only on this phone and never sent anywhere, so
 * nobody can tell whether a message was read. It only lights and clears the honey dot.
 */

export type SeenMarks = Readonly<Record<string, number>>;

/** The marks with a farm seen up to `seq`; the same object when that's no news. */
export function markSeen(marks: SeenMarks, farm: string, seq: number): SeenMarks {
  if ((marks[farm] ?? 0) >= seq) return marks;
  return { ...marks, [farm]: seq };
}

/** The last seq this phone has shown of a farm's chat; 0 for never. */
export function seenTo(marks: SeenMarks, farm: string): number {
  return marks[farm] ?? 0;
}
