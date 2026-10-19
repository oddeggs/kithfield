import type { StoreProductId } from '@kithfield/contracts';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, {
  PRODUCT_CATEGORY,
  PURCHASES_ERROR_CODE,
  type PurchasesStoreProduct,
} from 'react-native-purchases';

import { isSubscription, noStore, type BuyResult, type Store } from './store';

/** The variant's public RevenueCat key, from `REVENUECAT_IOS_KEY` when Metro started. */
const sdkKey = (): string | null => {
  const extra = Constants.expoConfig?.extra as { revenueCatIosKey?: unknown } | undefined;
  const key = extra?.revenueCatIosKey;
  return Platform.OS === 'ios' && typeof key === 'string' && key !== '' ? key : null;
};

const errorCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null;

/**
 * The store through RevenueCat, logged in as `person` (anonymous people too, so a later sign-in
 * merge moves their purchases with a RevenueCat transfer). Products are looked up by id, once.
 */
export function revenueCatStore(person: string): Store {
  const key = sdkKey();
  if (key === null) return noStore;
  let ready: Promise<void> | null = null;
  const start = (): Promise<void> => {
    ready ??= (async () => {
      if (!(await Purchases.isConfigured())) {
        Purchases.configure({ apiKey: key, appUserID: person });
        return;
      }
      if ((await Purchases.getAppUserID()) !== person) await Purchases.logIn(person);
    })();
    return ready;
  };
  const known = new Map<string, PurchasesStoreProduct>();

  const lookUp = async (products: readonly string[]): Promise<void> => {
    const missing = products.filter((p) => !known.has(p));
    if (missing.length === 0) return;
    await start();
    const subs = missing.filter(isSubscription);
    const once = missing.filter((p) => !isSubscription(p));
    const found = [
      ...(subs.length > 0 ? await Purchases.getProducts(subs, PRODUCT_CATEGORY.SUBSCRIPTION) : []),
      ...(once.length > 0
        ? await Purchases.getProducts(once, PRODUCT_CATEGORY.NON_SUBSCRIPTION)
        : []),
    ];
    for (const product of found) known.set(product.identifier, product);
  };

  return {
    available: true,
    async prices(products) {
      try {
        await lookUp(products);
      } catch {
        return {};
      }
      const out: Record<string, string> = {};
      for (const id of products) {
        const product = known.get(id);
        if (product) out[id] = product.priceString;
      }
      return out;
    },
    async buy(product: StoreProductId): Promise<BuyResult> {
      try {
        await lookUp([product]);
        const found = known.get(product);
        if (!found) return { kind: 'unavailable' };
        const result = await Purchases.purchaseStoreProduct(found);
        return { kind: 'bought', transaction: result.transaction.transactionIdentifier };
      } catch (error) {
        const code = errorCode(error);
        if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return { kind: 'cancelled' };
        if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { kind: 'pending' };
        return { kind: 'failed' };
      }
    },
    async restore() {
      try {
        await start();
        await Purchases.restorePurchases();
        return true;
      } catch {
        return false;
      }
    },
    async manage() {
      await start();
      await Purchases.showManageSubscriptions();
    },
  };
}
