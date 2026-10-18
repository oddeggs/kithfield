import { KNOWN_REACTIONS } from '@kithfield/contracts';

/** The dewdrop in the reaction tray: a `dewdrop` event with a target, never a reaction. */
export const DEWDROP = 'dewdrop';

/** Every warm thing in the reaction tray: the dewdrop, then the reactions this app draws. */
export type TrayReaction = typeof DEWDROP | (typeof KNOWN_REACTIONS)[number];

/** How a reaction sits on its tile: the dewdrop's pale blue, the firefly's night, or bare. */
export type ReactionTone = 'dewdrop' | 'firefly' | 'plain';

export interface ReactionMeta {
  readonly id: TrayReaction;
  /** The design's icon. */
  readonly icon: string;
  readonly tone: ReactionTone;
}

const toneOf = (id: TrayReaction): ReactionTone =>
  id === DEWDROP ? 'dewdrop' : id === 'firefly' ? 'firefly' : 'plain';

/**
 * The twelve, in the order of the full sheet: the dewdrop first, then the known reactions. Each
 * reaction's icon has its own name.
 */
export const ALL_REACTIONS: readonly ReactionMeta[] = [
  DEWDROP,
  'sun',
  'heart',
  'sprout',
  'wave',
  'firefly',
  'raincloud',
  'bee',
  'rosette',
  'lantern',
  'leaf',
  'moon',
].map((id) => ({ id: id as TrayReaction, icon: id, tone: toneOf(id as TrayReaction) }));

/** What the long-press tray shows before anyone has picked a favourite. */
const DEFAULT_QUICK: readonly TrayReaction[] = [DEWDROP, 'sun', 'sprout', 'wave', 'firefly'];

/** How many reactions the long-press tray holds beside its "more" button. */
export const QUICK_COUNT = 5;

/**
 * The long-press tray: the dewdrop always first, then the reactions this person picks most often
 * (only ordering, never shown), filled up from the design's defaults.
 */
export function quickReactions(mine: readonly string[]): readonly ReactionMeta[] {
  const uses = new Map<string, number>();
  for (const r of mine) uses.set(r, (uses.get(r) ?? 0) + 1);
  const known = new Set<string>(KNOWN_REACTIONS);
  const favourites = [...uses.entries()]
    .filter(([r]) => known.has(r))
    .sort((a, b) => b[1] - a[1])
    .map(([r]) => r as TrayReaction);
  const picked: TrayReaction[] = [DEWDROP];
  for (const r of [...favourites, ...DEFAULT_QUICK]) {
    if (picked.length >= QUICK_COUNT) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked.map((id) => ({ id, icon: id, tone: toneOf(id) }));
}

/** Whether a reaction name from the wire is one this app knows how to draw. */
export const isKnownReaction = (name: string): name is TrayReaction =>
  name === DEWDROP || (KNOWN_REACTIONS as readonly string[]).includes(name);

/** One mark in a message's reaction row: which, and whether one of them is yours. */
export interface RowMark {
  readonly id: string;
  readonly icon: string;
  readonly mine: boolean;
}

/** The icon a reaction from the wire is drawn with; one this app doesn't know gets a sparkle. */
export const iconOfReaction = (name: string): string => (isKnownReaction(name) ? name : 'sparkle');

/**
 * What a message's reaction row shows: the dewdrop first when anyone left one, then each
 * reaction someone has on it now (one per person; a `null` took theirs back), each drawn once.
 * Never how many: care isn't counted.
 */
export function reactionRow(
  events: readonly { seq: number; actor: string | null; kind: string; payload: unknown }[],
  target: number,
  me: string | null,
): RowMark[] {
  const targetOf = (p: unknown) =>
    typeof p === 'object' && p !== null && 'target' in p ? p.target : null;
  let dew = false;
  let dewMine = false;
  const byPerson = new Map<string, string | null>();
  for (const e of events) {
    if (targetOf(e.payload) !== target || e.actor === null) continue;
    if (e.kind === 'dewdrop') {
      dew = true;
      dewMine ||= e.actor === me;
    } else if (e.kind === 'reaction') {
      const r = (e.payload as { reaction?: unknown }).reaction;
      byPerson.set(e.actor, typeof r === 'string' ? r : null);
    }
  }
  const marks: RowMark[] = dew ? [{ id: DEWDROP, icon: DEWDROP, mine: dewMine }] : [];
  for (const [person, r] of byPerson) {
    if (r === null) continue;
    const found = marks.find((m) => m.id === r);
    if (found) {
      if (person === me) marks[marks.indexOf(found)] = { ...found, mine: true };
    } else {
      marks.push({ id: r, icon: iconOfReaction(r), mine: person === me });
    }
  }
  return marks;
}
