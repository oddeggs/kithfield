import {
  BookCheckout,
  BookQuote,
  ChipIn,
  ChipInList,
  ChipInOffer,
  Collection,
  CritterVote,
  Entitlements,
  FarmersWall,
  FarmThemes,
  GiftStart,
  GiftView,
  PatronOffer,
  ShopCart,
  ShopCatalog,
  Wishlist,
  type ArtId,
  type BookOrderRequest,
  type ChipInPledgeRequest,
  type ChipInStartRequest,
  type FarmId,
  type GiftStartRequest,
  type Id,
  type PersonId,
  type StoreTransactionId,
} from '@kithfield/contracts';
import { z } from 'zod';

import type { ApiClient } from '../../data';

/*
 * The shop's HTTP calls (`http/shop.ts` and `http/gifts.ts` in the contracts). Each answer is
 * checked against its contract by `api.request`; a failure is an `ApiError` with the API's code.
 */

const NoContent = z.null();
const enc = encodeURIComponent;

export function shopApi(api: ApiClient) {
  return {
    catalog: () => api.request(ShopCatalog, 'GET', '/v1/shop/catalog'),
    cart: () => api.request(ShopCart, 'GET', '/v1/shop/cart'),
    keep: (item: ArtId) =>
      api.request(Entitlements, 'POST', `/v1/shop/items/${enc(item)}/keep`, {}),
    collection: () => api.request(Collection, 'GET', '/v1/me/collection'),
    entitlements: () => api.request(Entitlements, 'GET', '/v1/me/entitlements'),
    /** After a purchase or a restore: the server asks RevenueCat at once. */
    sync: () => api.request(Entitlements, 'POST', '/v1/purchases/sync', {}),
    chooseFarmPlus: (farm: FarmId) => api.request(NoContent, 'PUT', '/v1/me/farm-plus', { farm }),

    patronOffer: () => api.request(PatronOffer, 'GET', '/v1/patrons/offer'),
    wall: (after?: string) =>
      api.request(
        FarmersWall,
        'GET',
        after === undefined ? '/v1/patrons/wall' : `/v1/patrons/wall?after=${enc(after)}`,
      ),
    setWallName: (name: string | null) => api.request(NoContent, 'PUT', '/v1/me/wall', { name }),
    vote: () => api.request(CritterVote, 'GET', '/v1/patrons/vote'),
    castVote: (option: ArtId) => api.request(NoContent, 'PUT', '/v1/patrons/vote', { option }),

    wishlist: () => api.request(Wishlist, 'GET', '/v1/me/wishlist'),
    wish: (item: ArtId) => api.request(NoContent, 'PUT', `/v1/me/wishlist/${enc(item)}`, {}),
    unwish: (item: ArtId) => api.request(NoContent, 'DELETE', `/v1/me/wishlist/${enc(item)}`),
    friendsWishlist: (farm: FarmId, person: PersonId) =>
      api.request(Wishlist, 'GET', `/v1/farms/${enc(farm)}/members/${enc(person)}/wishlist`),

    startGift: (gift: GiftStartRequest) => api.request(GiftStart, 'POST', '/v1/gifts', gift),
    giftPaid: (gift: Id, transaction: StoreTransactionId) =>
      api.request(GiftView, 'POST', `/v1/gifts/${enc(gift)}/paid`, { transaction }),
    gift: (gift: Id) => api.request(GiftView, 'GET', `/v1/gifts/${enc(gift)}`),

    chipIns: (farm: FarmId) => api.request(ChipInList, 'GET', `/v1/farms/${enc(farm)}/chip-ins`),
    startChipIn: (farm: FarmId, what: ChipInStartRequest) =>
      api.request(ChipIn, 'POST', `/v1/farms/${enc(farm)}/chip-ins`, what),
    chipInOffer: () => api.request(ChipInOffer, 'GET', '/v1/chip-ins/offer'),
    pledge: (chipIn: Id, pledge: ChipInPledgeRequest) =>
      api.request(ChipIn, 'POST', `/v1/chip-ins/${enc(chipIn)}/pledges`, pledge),

    themes: (farm: FarmId) => api.request(FarmThemes, 'GET', `/v1/farms/${enc(farm)}/themes`),

    book: (farm: FarmId, year: number) =>
      api.request(BookQuote, 'GET', `/v1/farms/${enc(farm)}/book?year=${year}`),
    orderBook: (farm: FarmId, order: BookOrderRequest) =>
      api.request(BookCheckout, 'POST', `/v1/farms/${enc(farm)}/book/orders`, order),
  };
}

export type ShopApi = ReturnType<typeof shopApi>;
