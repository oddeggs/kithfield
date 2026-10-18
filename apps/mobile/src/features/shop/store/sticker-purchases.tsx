import { useEffect } from 'react';

import { useDataClient } from '../../../data';
import { useSession } from '../../../ui/session/session';
import { setPurchases, type PurchaseResult } from '../../stickers/purchase';
import { shopApi } from '../api';
import { storeFor } from '../data/shop-data';

/** Gift products are consumables the gift flow ties to a gift itself; anything else is kept. */
const isGift = (product: string) => product.startsWith('kf.gift.');

/**
 * Plugs the shop's store into stickers, for buying packs and paying for gifts from the sticker
 * screens: the store's own prices, and its sheet. A pack bought is synced at once, so the server
 * knows it is owned before the picker reads the collection again.
 */
export function StickerPurchases() {
  const person = useSession().person?.id ?? null;
  const { api } = useDataClient();
  useEffect(() => {
    if (person === null) return;
    const store = storeFor(person);
    if (!store.available) return;
    const shop = shopApi(api);
    setPurchases({
      prices: (products) => store.prices(products),
      start: async (product): Promise<PurchaseResult> => {
        const result = await store.buy(product);
        switch (result.kind) {
          case 'bought':
            if (!isGift(product)) await shop.sync().catch(() => undefined);
            return { status: 'purchased', transaction: result.transaction };
          // Ask to Buy lands later, by the webhook: nothing to say now.
          case 'pending':
          case 'cancelled':
            return { status: 'cancelled' };
          case 'unavailable':
            return { status: 'unavailable' };
          case 'failed':
            return { status: 'failed' };
        }
      },
    });
    return () => setPurchases(null);
  }, [person, api]);
  return null;
}
