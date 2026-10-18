import type { QuickTendWhy, StickerPayload } from '@kithfield/contracts';

import { OWN } from './catalogue';

/** What a Quick Tend card answers: why it waits, who wrote it and its seq. */
export interface QuickTendCardInfo {
  readonly why: QuickTendWhy;
  readonly actor: string | null;
  readonly seq: number;
}

/** A sticker id from your pack, alone or drawn with the person the card is about. */
type Pick = { readonly sticker: string; readonly together?: true; readonly alone: string };

const STICKERS: Readonly<Record<QuickTendWhy, readonly Pick[]>> = {
  // News, a question: a cheer, a proud face, and the two of you.
  question: [
    { sticker: 'yay', alone: 'yay' },
    { sticker: 'so_proud', alone: 'so_proud' },
    { sticker: 'us', together: true, alone: 'hug' },
  ],
  // Back after a long nap: hello by name, missed you together, welcome home.
  back: [
    { sticker: 'hi_you', alone: 'hi_you' },
    { sticker: 'missed', together: true, alone: 'miss' },
    { sticker: 'welcome_home', alone: 'welcome_home' },
  ],
  plan: [
    { sticker: 'im_in', alone: 'im_in' },
    { sticker: 'either', alone: 'either' },
    { sticker: 'our_way', together: true, alone: 'omw' },
  ],
  mention: [
    { sticker: 'thanks', alone: 'thanks' },
    { sticker: 'omw', alone: 'omw' },
    { sticker: 'heart_eyes', alone: 'heart_eyes' },
  ],
  birthday: [
    { sticker: 'yay', alone: 'yay' },
    { sticker: 'love', together: true, alone: 'love' },
    { sticker: 'hug', alone: 'hug' },
  ],
  doorstep: [
    { sticker: 'care', alone: 'care' },
    { sticker: 'hug', alone: 'hug' },
    { sticker: 'missed', together: true, alone: 'miss' },
  ],
};

/**
 * The three stickers a Quick Tend card offers, each answering the thing it waits on. A sticker
 * that draws the friend in is offered only when they can be drawn (`drawable`); otherwise its
 * plain stand-in is.
 */
export function quickStickers(
  card: QuickTendCardInfo,
  me: string | null,
  drawable: ReadonlySet<string>,
): StickerPayload[] {
  const friend =
    card.actor !== null && card.actor !== me && drawable.has(card.actor) ? card.actor : null;
  return STICKERS[card.why].map((p) =>
    p.together && friend
      ? { pack: OWN, sticker: p.sticker, with: [friend], replyTo: card.seq }
      : { pack: OWN, sticker: p.together ? p.alone : p.sticker, replyTo: card.seq },
  );
}
