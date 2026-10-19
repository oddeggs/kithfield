import type { Critter } from '@kithfield/contracts';
import type { Translate } from '@kithfield/i18n';

import { castOf, sceneLook } from '../../../ui/art/critter-look';
import { lookOfSticker, type CaptionKey } from './catalogue';

/*
 * A sticker as the art's `sticker` scene takes it: the sender's critter as they look now, the
 * pose, the friends drawn beside them (`cast`) and the words, written in the reader's language.
 */

/** No words on the sticker (the art draws none for `-`). */
export const NO_CAPTION = '-';

/** Who a sticker's words can name. */
export interface CaptionNames {
  /** The sender, then the friends drawn in, by name (null for a nameless member). */
  readonly people: readonly (string | null)[];
  /** The author of what the sticker answers, for "hi {name}!". */
  readonly replyTo?: string | null;
}

/** Words that name nobody. */
type PlainCaption = Exclude<CaptionKey, 'names' | 'loveYouName' | 'hiName'>;

/**
 * The words on a sticker. Words that name someone fall back to their plain form when the name
 * isn't known (a nameless member, a reply to something gone).
 */
export function captionText(t: Translate, caption: CaptionKey | null, names: CaptionNames): string {
  if (caption === null) return NO_CAPTION;
  const known = names.people.filter((n): n is string => n !== null && n.length > 0);
  if (caption === 'names') {
    return known.length >= 2 ? known.join(t('stickers.cap.namesJoin')) : t('stickers.cap.theGang');
  }
  if (caption === 'loveYouName') {
    const friend = names.people[1] ?? null;
    return friend ? t('stickers.cap.loveYouName', { name: friend }) : t('stickers.cap.loveYou');
  }
  if (caption === 'hiName') {
    const to = names.replyTo ?? null;
    return to ? t('stickers.cap.hiName', { name: to }) : t('stickers.cap.hiQ');
  }
  return t(`stickers.cap.${caption satisfies PlainCaption}`);
}

/** The `sticker` scene's attributes for a critter in a pose, with friends and words. */
export function stickerAttrs(
  sender: Critter | null,
  pose: string,
  caption: string,
  friends: readonly Critter[] = [],
  lang?: string,
): Record<string, string> {
  return {
    ...(sender ? sceneLook(sender) : { kind: 'rabbit' }),
    pose,
    caption,
    ...(lang ? { lang } : {}),
    ...(friends.length > 0 ? { cast: friends.map((c) => castOf(c)).join(',') } : {}),
  };
}

/** Someone a sticker draws: their name (null for a nameless member) and critter as they are now. */
export interface StickerPerson {
  readonly name: string | null;
  readonly critter: Critter;
}

/**
 * The `sticker` scene for a sticker from the wire: the sender as they look now, the friends in it
 * (anyone the phone can't find is left out), and the words in the reader's language.
 */
export function sceneOfSticker(
  t: Translate,
  sticker: {
    readonly pack: string;
    readonly sticker: string;
    readonly with?: readonly string[] | undefined;
  },
  sender: StickerPerson | null,
  personOf: (person: string) => StickerPerson | null,
  replyTo: string | null = null,
): Record<string, string> {
  const found = (sticker.with ?? []).map((p) => [p, personOf(p)] as const);
  const friends = found.map(([, p]) => p).filter((p): p is StickerPerson => p !== null);
  // The pose follows who is actually drawn; a sticker whose friends are all gone keeps its own.
  const drawn = found.filter(([, p]) => p !== null).map(([id]) => id);
  const look = lookOfSticker(drawn.length > 0 ? { ...sticker, with: drawn } : sticker);
  const caption = captionText(t, look.caption, {
    people: [sender?.name ?? null, ...friends.map((f) => f.name)],
    replyTo,
  });
  // The words' language, so the art can write them in a hand that has their letters.
  return stickerAttrs(
    sender?.critter ?? null,
    look.pose,
    caption,
    friends.map((f) => f.critter),
    t('stickers.lang'),
  );
}
