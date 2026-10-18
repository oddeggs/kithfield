import type { QuickTendList, QuickTendWhy } from '@kithfield/contracts';

export type QuickTendItem = QuickTendList['items'][number];

/** How many waiting things get a card of their own; the rest fold into the bouquet. */
export const CARDS = 3;

export function splitQuickTend(items: readonly QuickTendItem[]): {
  cards: QuickTendItem[];
  rest: QuickTendItem[];
} {
  return { cards: items.slice(0, CARDS), rest: items.slice(CARDS) };
}

/** A gentle answer on a card: a few words back, a yes to a plan, or a dewdrop for a birthday. */
export type QuickReply =
  | { readonly kind: 'message'; readonly words: QuickWords }
  | { readonly kind: 'rsvp'; readonly answer: 'in' | 'maybe'; readonly words: QuickWords }
  | { readonly kind: 'dewdrop'; readonly words: QuickWords };

/** The copy of each answer, by its catalogue key's last part. */
export type QuickWords =
  | 'yes'
  | 'notThisTime'
  | 'missedYou'
  | 'welcomeBack'
  | 'onIt'
  | 'thanks'
  | 'imIn'
  | 'maybe'
  | 'happyBirthday'
  | 'thinkingOfYou';

const replies: Record<QuickTendWhy, readonly QuickReply[]> = {
  question: [
    { kind: 'message', words: 'yes' },
    { kind: 'message', words: 'notThisTime' },
  ],
  back: [
    { kind: 'message', words: 'missedYou' },
    { kind: 'message', words: 'welcomeBack' },
  ],
  mention: [
    { kind: 'message', words: 'onIt' },
    { kind: 'message', words: 'thanks' },
  ],
  plan: [
    { kind: 'rsvp', answer: 'in', words: 'imIn' },
    { kind: 'rsvp', answer: 'maybe', words: 'maybe' },
  ],
  birthday: [
    { kind: 'dewdrop', words: 'happyBirthday' },
    { kind: 'message', words: 'happyBirthday' },
  ],
  doorstep: [{ kind: 'message', words: 'thinkingOfYou' }],
};

/**
 * The answers a card offers. A plan answers with an RSVP only when the waiting thing is the plan
 * itself; otherwise it gets words.
 */
export function repliesFor(item: QuickTendItem): readonly QuickReply[] {
  if (item.why === 'plan' && item.kind !== 'seed_planted') return replies.question;
  return replies[item.why];
}

/** One phrase of the bouquet's summary, by catalogue key and its parameters. */
export type BouquetPart =
  | { readonly key: 'photos'; readonly name: string }
  | { readonly key: 'voice'; readonly name: string }
  | { readonly key: 'plans'; readonly name: string }
  | { readonly key: 'hellos' };

/**
 * What the bouquet holds, in words: whose photos, whose voice note, which farm's plans, then
 * "little hellos" for everything else. Names and kinds only, never how many.
 */
export function bouquetParts(
  rest: readonly QuickTendItem[],
  nameOf: (item: QuickTendItem) => string | null,
): BouquetPart[] {
  const parts: BouquetPart[] = [];
  const seen = new Set<string>();
  let others = false;
  for (const item of rest) {
    const name = nameOf(item);
    const key =
      item.kind === 'media'
        ? 'photos'
        : item.kind === 'voice'
          ? 'voice'
          : item.kind === 'seed_planted' || item.why === 'plan'
            ? 'plans'
            : null;
    const id = `${key}:${name}`;
    if (key === null || name === null || parts.length >= 3) {
      others = true;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    parts.push({ key, name });
  }
  if (others || parts.length === 0) parts.push({ key: 'hellos' });
  return parts;
}

/** The write an answer makes on the farm it answers. */
export function writeOf(
  item: QuickTendItem,
  reply: QuickReply,
  words: string,
): { kind: string; payload: unknown } {
  if (reply.kind === 'rsvp')
    return { kind: 'rsvp', payload: { seed: item.seq, answer: reply.answer } };
  if (reply.kind === 'dewdrop' && item.actor)
    return { kind: 'dewdrop', payload: { to: item.actor } };
  return { kind: 'message', payload: { text: words, replyTo: item.seq } };
}
