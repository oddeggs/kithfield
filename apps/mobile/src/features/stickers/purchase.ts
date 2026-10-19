import type { StoreProductId } from '@kithfield/contracts';

/*
 * Where stickers meet the shop's purchase flow. Buying a pack and paying for a gift both go
 * through the shop (StoreKit through RevenueCat, then `POST /v1/purchases/sync`); stickers only
 * ask for a product by its store id and read the answer. Until the shop plugs its flow in with
 * `setPurchases`, the store is closed: prices are unknown and nothing can be bought.
 */

export type PurchaseResult =
  /** Paid. `transaction` is the store's id for it (a gift sends it to `POST /v1/gifts/:id/paid`). */
  | { readonly status: 'purchased'; readonly transaction: string }
  /** The person closed the store's sheet. */
  | { readonly status: 'cancelled' }
  /** The store couldn't take it; nothing was charged. */
  | { readonly status: 'failed' }
  /** No store on this phone (or not yet wired in). */
  | { readonly status: 'unavailable' };

export interface Purchases {
  /** The store's own display prices by product id; missing ones are unknown. */
  prices(products: readonly StoreProductId[]): Promise<Readonly<Record<string, string>>>;
  /** Opens the store's sheet for one product. */
  start(product: StoreProductId): Promise<PurchaseResult>;
}

const closed: Purchases = {
  prices: () => Promise.resolve({}),
  start: () => Promise.resolve({ status: 'unavailable' }),
};

let current: Purchases = closed;
const listeners = new Set<() => void>();

/** The shop plugs its purchase flow in here once, at start. */
export function setPurchases(purchases: Purchases | null): void {
  current = purchases ?? closed;
  for (const l of listeners) l();
}

/** Whether a store is plugged in. */
export function purchasesOpen(): boolean {
  return current !== closed;
}

/** Called when the shop plugs in or out, so prices can load. */
export function onPurchasesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Buys one product through the shop's flow. */
export function startPurchase(product: StoreProductId): Promise<PurchaseResult> {
  return current.start(product);
}

/** The store's display prices for these products. */
export function storePrices(
  products: readonly StoreProductId[],
): Promise<Readonly<Record<string, string>>> {
  return current.prices(products);
}
