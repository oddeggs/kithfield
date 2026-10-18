import { LIMITS, OWN_PACK, itemProduct, type KNOWN_STICKER_PACKS } from '@kithfield/contracts';

/*
 * Every sticker the app knows: which pack it is in, the pose the art draws and the words on it.
 * A sticker on the wire is `{pack, sticker, with?}`; the art draws the sender's critter as they
 * look now in that pose, and each phone writes the caption in its own language. Poses are the
 * art's own (`STK` in the renderer); captions are keys in the stickers catalogue
 * (`stickers.cap.<caption>`).
 */

export type PackId = (typeof KNOWN_STICKER_PACKS)[number];

/** Everyone's own pack. */
export const OWN: PackId = OWN_PACK;

/** The words on a sticker, by their catalogue key's last part. */
export type CaptionKey =
  | 'hiQ'
  | 'hi'
  | 'loveYou'
  | 'imIn'
  | 'omwBang'
  | 'swingBy'
  | 'dnd'
  | 'sawThis'
  | 'brb'
  | 'hug'
  | 'ha'
  | 'sleepy'
  | 'thankYou'
  | 'onMyWay'
  | 'yay'
  | 'hereForYou'
  | 'missYou'
  | 'nope'
  | 'missUrFace'
  | 'imInBang'
  | 'upWeGo'
  | 'gotMail'
  | 'aaaa'
  | 'bigMood'
  | 'youUp'
  | 'lol'
  | 'stares'
  | 'sayLess'
  | 'hanging'
  | 'zoom'
  | 'cosyDay'
  | 'tea'
  | 'duvetDay'
  | 'home'
  | 'napTime'
  | 'cosyNight'
  | 'driftingBy'
  | 'jumpingIn'
  | 'hbd'
  | 'hbdSign'
  | 'makeAWish'
  | 'birthdayHug'
  | 'wow'
  | 'goodLuck'
  | 'youGotThis'
  | 'hangInThere'
  | 'proudOfYou'
  | 'goOn'
  | 'howDidItGo'
  | 'didIt'
  | 'growing'
  | 'offIGo'
  | 'hiFromHere'
  | 'soProud'
  | 'welcomeHome'
  | 'either'
  | 'sat'
  | 'sun'
  | 'theGang'
  | 'missedYou'
  | 'friendTower'
  | 'onOurWay'
  | 'loveYouName'
  | 'hiName'
  | 'names';

export interface StickerDef {
  /** The sticker's id inside its pack, as it travels. */
  readonly id: string;
  /** The art's pose. */
  readonly pose: string;
  /** The words on it. */
  readonly caption: CaptionKey;
  /** Offered only as a reply (Quick Tend), never in the picker or a pack that leaves the app. */
  readonly replyOnly?: boolean;
}

export interface PackDef {
  readonly id: PackId;
  /** The free pack is everyone's; the rest are shop items. */
  readonly free: boolean;
  readonly stickers: readonly StickerDef[];
}

const s = (id: string, pose: string, caption: CaptionKey): StickerDef => ({ id, pose, caption });
const reply = (id: string, pose: string, caption: CaptionKey): StickerDef => ({
  id,
  pose,
  caption,
  replyOnly: true,
});

/** Everyone's own pack: free forever, always wearing what their critter has on now. */
const MINE: PackDef = {
  id: OWN_PACK,
  free: true,
  stickers: [
    s('peek', 'peek', 'hiQ'),
    s('heart_eyes', 'faceLove', 'loveYou'),
    s('im_in', 'sign', 'imIn'),
    s('tumble', 'tumble', 'omwBang'),
    s('swing', 'swing', 'swingBy'),
    s('duvet', 'burrito', 'dnd'),
    s('star_eyes', 'faceStar', 'sawThis'),
    s('balloon', 'balloon', 'brb'),
    s('wave', 'wave', 'hi'),
    s('hug', 'hug', 'hug'),
    s('love', 'love', 'loveYou'),
    s('laugh', 'laugh', 'ha'),
    s('sleepy', 'sleepy', 'sleepy'),
    s('thanks', 'thanks', 'thankYou'),
    s('omw', 'omw', 'onMyWay'),
    s('yay', 'yay', 'yay'),
    s('care', 'care', 'hereForYou'),
    s('miss', 'miss', 'missYou'),
    s('nope', 'nope', 'nope'),
    s('face', 'face', 'missUrFace'),
    s('in', 'in', 'imInBang'),
    s('saw', 'saw', 'sawThis'),
    s('kite', 'kite', 'upWeGo'),
    s('mail', 'mailbox', 'gotMail'),
    reply('so_proud', 'faceLove', 'soProud'),
    reply('hi_you', 'peek', 'hiName'),
    reply('welcome_home', 'window', 'welcomeHome'),
    reply('either', 'flop', 'either'),
  ],
};

const PACKS: readonly PackDef[] = [
  MINE,
  {
    id: 'big_feelings',
    free: false,
    stickers: [
      s('aaaa', 'screm', 'aaaa'),
      s('big_mood', 'bigmood', 'bigMood'),
      s('you_up', 'corner', 'youUp'),
      s('lol', 'flop', 'lol'),
      s('stares', 'face', 'stares'),
      s('say_less', 'sign', 'sayLess'),
      s('hanging', 'hang', 'hanging'),
      s('zoom', 'tumble', 'zoom'),
    ],
  },
  {
    id: 'cosy_weather',
    free: false,
    stickers: [
      s('cosy_day', 'umbrella', 'cosyDay'),
      s('tea', 'mug', 'tea'),
      s('duvet_day', 'burrito', 'duvetDay'),
      s('home', 'window', 'home'),
      s('nap', 'hammock', 'napTime'),
      s('cosy_night', 'marsh', 'cosyNight'),
      s('drifting', 'boat', 'driftingBy'),
      s('leaves', 'leafpile', 'jumpingIn'),
    ],
  },
  {
    id: 'birthday_bloom',
    free: false,
    stickers: [
      s('hbd', 'cake', 'hbd'),
      s('yay', 'yay', 'yay'),
      s('love', 'faceLove', 'loveYou'),
      s('hbd_sign', 'sign', 'hbdSign'),
      s('wish', 'balloon', 'makeAWish'),
      s('hug', 'hug', 'birthdayHug'),
      s('thanks', 'thanks', 'thankYou'),
      s('wow', 'faceStar', 'wow'),
    ],
  },
  {
    id: 'good_luck',
    free: false,
    stickers: [
      s('good_luck', 'clover', 'goodLuck'),
      s('got_this', 'sign', 'youGotThis'),
      s('hang_in', 'hang', 'hangInThere'),
      s('proud', 'thanks', 'proudOfYou'),
      s('go_on', 'faceStar', 'goOn'),
      s('care', 'care', 'hereForYou'),
      s('how', 'peek', 'howDidItGo'),
      s('did_it', 'yay', 'didIt'),
    ],
  },
  {
    id: 'out_and_about',
    free: false,
    stickers: [
      s('kite', 'kite', 'upWeGo'),
      s('growing', 'water', 'growing'),
      s('mail', 'mailbox', 'gotMail'),
      s('omw', 'omw', 'onMyWay'),
      s('swing', 'swing', 'swingBy'),
      s('off', 'balloon', 'offIGo'),
      s('hi', 'wave', 'hiFromHere'),
      s('saw', 'saw', 'sawThis'),
    ],
  },
];

const byId = new Map<string, PackDef>(PACKS.map((p) => [p.id, p]));

/** Every pack, the free one first. */
export function allPacks(): readonly PackDef[] {
  return PACKS;
}

/** A pack this app knows, or null for one a newer app sent. */
export function packOf(id: string): PackDef | null {
  return byId.get(id) ?? null;
}

/** The stickers a pack offers in the picker and takes out of the app. */
export function offered(pack: PackDef): readonly StickerDef[] {
  return pack.stickers.filter((st) => st.replyOnly !== true);
}

/** The shop's packs, in the order the shop shows them. */
export function shopPacks(): readonly PackDef[] {
  return SHOP_ORDER.map((id) => byId.get(id)).filter((p): p is PackDef => p !== undefined);
}

const SHOP_ORDER: readonly PackId[] = [
  'big_feelings',
  'cosy_weather',
  'birthday_bloom',
  'good_luck',
  'out_and_about',
];

/** The store product that buys a pack for yourself. */
export const packProduct = (pack: PackId): string => itemProduct(pack);

/**
 * The order a pack leaves the app in (the Messages drawer, WhatsApp, Telegram): the everyday
 * ones first, then the rest of the pack as the picker shows it.
 */
const EXPORT_FIRST = ['wave', 'hug', 'love', 'laugh', 'sleepy', 'thanks', 'omw', 'yay', 'care'];

export function exportOrder(pack: PackDef): readonly StickerDef[] {
  const all = offered(pack);
  const first = EXPORT_FIRST.map((id) => all.find((st) => st.id === id)).filter(
    (st): st is StickerDef => st !== undefined,
  );
  return [...first, ...all.filter((st) => !EXPORT_FIRST.includes(st.id))];
}

/* Together stickers */

/**
 * A together sticker draws friends' real critters beside yours. `who` says which of the picked
 * friends it draws: all of them, or one. Its words are either fixed or the names of everyone in it.
 */
export interface TogetherDef {
  readonly id: string;
  readonly caption: CaptionKey;
  readonly who: 'all' | 'first' | 'last';
}

const TOGETHER: readonly TogetherDef[] = [
  { id: 'us', caption: 'names', who: 'all' },
  { id: 'gang', caption: 'theGang', who: 'all' },
  { id: 'missed', caption: 'missedYou', who: 'first' },
  { id: 'tower', caption: 'friendTower', who: 'all' },
  { id: 'thanks', caption: 'thankYou', who: 'last' },
  { id: 'proud', caption: 'soProud', who: 'first' },
  { id: 'our_way', caption: 'onOurWay', who: 'all' },
  { id: 'love', caption: 'loveYouName', who: 'first' },
];

const togetherById = new Map(TOGETHER.map((d) => [d.id, d]));

/** Every together sticker, in the order the picker shows them. */
export function togetherStickers(): readonly TogetherDef[] {
  return TOGETHER;
}

export function togetherOf(id: string): TogetherDef | null {
  return togetherById.get(id) ?? null;
}

/** The pose a together sticker takes with this many friends in it. */
export function togetherPose(def: TogetherDef, friends: number): string {
  if (def.id === 'tower') return 'stack';
  if (def.id === 'gang' || def.id === 'our_way') return 'squad';
  return friends <= 1 ? 'hug2' : 'squad';
}

/** The friends a together sticker draws, from those picked (at most `LIMITS.stickerFriends`). */
export function togetherWith<T>(def: TogetherDef, picked: readonly T[]): T[] {
  const kept = picked.slice(0, LIMITS.stickerFriends);
  if (kept.length === 0) return [];
  if (def.who === 'first') return kept.slice(0, 1);
  if (def.who === 'last') return kept.slice(-1);
  return kept;
}

/* What a sticker on the wire draws */

/** A sticker as the art draws it: its pose and the words on it. */
export interface StickerLook {
  readonly pose: string;
  readonly caption: CaptionKey | null;
  /** Together: the friends drawn beside the sender, as the payload names them. */
  readonly together: boolean;
}

/**
 * How to draw a sticker from the wire. A pack or sticker this app doesn't know yet is drawn as a
 * wave, without words; a sticker with friends in it is a together sticker.
 */
export function lookOfSticker(sticker: {
  readonly pack: string;
  readonly sticker: string;
  readonly with?: readonly string[] | undefined;
}): StickerLook {
  const friends = sticker.with?.length ?? 0;
  if (friends > 0) {
    const def = togetherOf(sticker.sticker);
    if (def) return { pose: togetherPose(def, friends), caption: def.caption, together: true };
    return { pose: friends === 1 ? 'hug2' : 'squad', caption: null, together: true };
  }
  const def = packOf(sticker.pack)?.stickers.find((st) => st.id === sticker.sticker);
  if (def) return { pose: def.pose, caption: def.caption, together: false };
  return { pose: 'wave', caption: null, together: false };
}
