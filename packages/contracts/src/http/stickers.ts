import { z } from 'zod';

import { EpochMs, FarmId, LIMITS, PersonId } from '../primitives';

/*
 * Stickers travel as `sticker {pack, sticker, with?}` events (payloads/chat.ts): a pack and a pose,
 * both art ids, so a pack or pose this app doesn't know is drawn with a fallback. Everyone's own
 * pack is free and always wears what their critter has on; other packs are shop items
 * (`ShopItem` of kind `sticker_pack`), owned forever and giftable.
 */

/** Everyone's own animated pack, free. */
export const OWN_PACK = 'mine';

/** The packs this app knows how to draw. */
export const KNOWN_STICKER_PACKS = [
  OWN_PACK,
  'out_and_about',
  'big_feelings',
  'cosy_weather',
  'birthday_bloom',
  'good_luck',
] as const;

/*
 * Together stickers draw friends' real critters. Inside Kithfield a friend is in unless they
 * turned it off (`MeSettings.inTogetherStickers`), and each gets a small "you're in a sticker"
 * note the first time. Taking one out to another app (Messages, Telegram, WhatsApp, Photos) needs
 * a yes from every friend in it, asked once.
 */

/**
 * `GET /v1/farms/:id/together`: who on this farm the asker may draw into a together sticker:
 * members who haven't turned it off, never anyone either of them blocked, never removed members.
 */
export const TogetherPeople = z.object({ people: z.array(PersonId).max(LIMITS.members) });
export type TogetherPeople = z.infer<typeof TogetherPeople>;

/**
 * `POST /v1/stickers/together/export`: before a together sticker leaves Kithfield, ask the friends
 * in it. Each friend is asked once by each asker; asking again only reads where things stand.
 * Answers `TogetherExportConsents`.
 */
export const TogetherExportRequest = z.object({
  farm: FarmId,
  people: z.array(PersonId).min(1).max(LIMITS.stickerFriends),
});
export type TogetherExportRequest = z.infer<typeof TogetherExportRequest>;

/**
 * The friends who said yes. A no and no answer yet look the same, so nobody learns who said no;
 * the sticker exports once everyone in it is here.
 */
export const TogetherExportConsents = z.object({
  ok: z.array(PersonId).max(LIMITS.stickerFriends),
});
export type TogetherExportConsents = z.infer<typeof TogetherExportConsents>;

/**
 * `GET /v1/stickers/together/asks`: friends asking to take together stickers with this person in
 * them out of Kithfield, and the answers given so far (null until answered). Answered or changed
 * with `PUT /v1/stickers/together/asks/:person` (`TogetherAskAnswer`, 204).
 */
export const TogetherAskList = z.object({
  asks: z
    .array(z.object({ from: PersonId, farm: FarmId, at: EpochMs, ok: z.boolean().nullable() }))
    .max(500),
});
export type TogetherAskList = z.infer<typeof TogetherAskList>;

export const TogetherAskAnswer = z.object({ ok: z.boolean() });
export type TogetherAskAnswer = z.infer<typeof TogetherAskAnswer>;
