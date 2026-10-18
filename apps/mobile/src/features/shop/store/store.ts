import { PATRON_PRODUCTS, type StoreProductId } from '@kithfield/contracts';

/*
 * The store the shop buys through: the App Store and Play by way of RevenueCat. Screens see only
 * this seam. Prices are the store's own display prices, never the server's; with no store on this
 * phone (no RevenueCat key in this build) everything answers `unavailable` and nothing pretends.
 */

export type BuyResult =
  | { readonly kind: 'bought'; readonly transaction: string }
  /** The person closed the sheet: nothing to say. */
  | { readonly kind: 'cancelled' }
  /** Ask to Buy or a pending payment: it lands later, by the webhook. */
  | { readonly kind: 'pending' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed' };

export interface Store {
  /** Whether purchases can happen on this phone at all. */
  readonly available: boolean;
  /** Display prices by product id (`£4.99`), for the products the store knows. */
  prices(products: readonly StoreProductId[]): Promise<Readonly<Record<string, string>>>;
  buy(product: StoreProductId): Promise<BuyResult>;
  /** Restores purchases; true when it reached the store. */
  restore(): Promise<boolean>;
  /** The system's subscription management (cancel, switch plan). */
  manage(): Promise<void>;
}

const SUBSCRIPTIONS: ReadonlySet<string> = new Set([
  PATRON_PRODUCTS.patronMonthly,
  PATRON_PRODUCTS.patronYearly,
  PATRON_PRODUCTS.farmPlusMonthly,
]);

/** Auto-renewing subscriptions are fetched apart from one-off purchases. */
export const isSubscription = (product: string): boolean => SUBSCRIPTIONS.has(product);

/** A store that isn't there: every purchase answers `unavailable`. */
export const noStore: Store = {
  available: false,
  prices: () => Promise.resolve({}),
  buy: () => Promise.resolve({ kind: 'unavailable' }),
  restore: () => Promise.resolve(false),
  manage: () => Promise.resolve(),
};
