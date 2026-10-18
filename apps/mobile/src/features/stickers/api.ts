import {
  Collection,
  Entitlements,
  GiftStart,
  GiftView,
  ShopCatalog,
  TogetherAskList,
  TogetherExportConsents,
  TogetherPeople,
  type GiftStartRequest,
  type TogetherAskAnswer,
  type TogetherExportRequest,
} from '@kithfield/contracts';
import { z } from 'zod';

import type { ApiClient } from '../../data';

/** A 204's empty body. */
const NoContent = z.null();

const at = (farm: string) => encodeURIComponent(farm);

/** The server calls stickers make, each checked against its contract. */
export function stickersApi(api: ApiClient) {
  return {
    /** Who on this farm can be drawn into a together sticker. */
    together: (farm: string) =>
      api.request(TogetherPeople, 'GET', `/v1/farms/${at(farm)}/together`),
    /** Asks the friends in a together sticker before it leaves; answers who said yes. */
    askToExport: (req: TogetherExportRequest) =>
      api.request(TogetherExportConsents, 'POST', '/v1/stickers/together/export', req),
    /** Friends asking to take together stickers with you in them out of Kithfield. */
    asks: () => api.request(TogetherAskList, 'GET', '/v1/stickers/together/asks'),
    answerAsk: (person: string, answer: TogetherAskAnswer) =>
      api.request(NoContent, 'PUT', `/v1/stickers/together/asks/${at(person)}`, answer),
    /** Everything the person owns and where it came from: the packs they can send from. */
    collection: () => api.request(Collection, 'GET', '/v1/me/collection'),
    /** What the person owns (packs among it), so the picker and the shop know. */
    entitlements: () => api.request(Entitlements, 'GET', '/v1/me/entitlements'),
    /** The shop's catalogue: which packs exist, their gift products, the free wrappings. */
    catalog: () => api.request(ShopCatalog, 'GET', '/v1/shop/catalog'),
    /** Starts a gift before it is paid for. */
    startGift: (req: GiftStartRequest) => api.request(GiftStart, 'POST', '/v1/gifts', req),
    /** The store transaction that paid for a gift. */
    giftPaid: (gift: string, transaction: string) =>
      api.request(GiftView, 'POST', `/v1/gifts/${at(gift)}/paid`, { transaction }),
  };
}

export type StickersApi = ReturnType<typeof stickersApi>;
