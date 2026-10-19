import type { Href } from 'expo-router';

/** Links to the sticker screens, each by the route's own typed path. */

type Params = Record<string, string | number | undefined>;

/** The params that are set, as strings. */
const given = (params: Params): Record<string, string> =>
  Object.fromEntries(
    Object.entries(params)
      .filter((e): e is [string, string | number] => e[1] !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );

export const stickerRoutes = {
  /** The picker over a farm's chat. */
  picker: (farm: string): Href => ({ pathname: '/(modal)/stickers-picker', params: { farm } }),
  /** Together stickers: pick friends from this farm. `ask` is set to take one out of the app. */
  together: (farm: string, ask?: boolean): Href => ({
    pathname: '/(cover)/stickers-together',
    params: given({ farm, ask: ask ? '1' : undefined }),
  }),
  /** The sticker shop; `farm` is where a gift would go from. */
  shop: (farm?: string): Href => ({ pathname: '/(cover)/stickers-shop', params: given({ farm }) }),
  /** Gifting a pack to a friend on `farm`. */
  gift: (pack: string, farm?: string, to?: string): Href => ({
    pathname: '/(cover)/stickers-gift',
    params: given({ pack, farm, to }),
  }),
  /** A gifted pack opening, from the `gift {given}` event at `seq` on `farm`. */
  opened: (farm: string, seq: number): Href => ({
    pathname: '/(cover)/stickers-opened',
    params: { farm, seq: String(seq) },
  }),
  /** Your stickers, elsewhere: Messages, Telegram, WhatsApp and Photos. */
  export: (): Href => ({ pathname: '/(cover)/stickers-export' }),
  /** Packing your pack for Telegram and WhatsApp. */
  adding: (): Href => ({ pathname: '/(cover)/stickers-adding' }),
  /** Friends asking to take together stickers with you in them out of Kithfield. */
  asks: (): Href => ({ pathname: '/(modal)/stickers-asks' }),
  /** A farm's chat, to write instead (the chat feature). */
  chat: (farm: string): Href => ({ pathname: '/(tabs)/chat/[farm]', params: { farm } }),
};
