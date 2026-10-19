import type {
  Collection,
  Entitlements,
  Me,
  ShopCart,
  ShopCatalog,
  ShopItem,
  StoreProductId,
  Wishlist,
} from '@kithfield/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useDataClient } from '../../../data/react';
import { useSession } from '../../../ui/session/session';
import { useLocale } from '../../../ui/locale/locale-provider';
import { shopApi, type ShopApi } from '../api';
import { priceShown } from '../format';
import { resumePendingGifts } from './resume-gifts';
import { revenueCatStore } from '../store/revenuecat';
import { noStore, type Store } from '../store/store';

/*
 * What every shop screen reads: the catalogue and this week's cart, the person's entitlements,
 * collection and wishlist, and the store's display prices. Loaded once when the shop opens and
 * kept while it's open; a purchase or a keep replaces the entitlements with the server's answer.
 */

export interface ShopData {
  readonly person: string;
  readonly api: ShopApi;
  readonly store: Store;
  readonly me: Me | null;
  readonly catalog: ShopCatalog | null;
  readonly cart: ShopCart | null;
  readonly entitlements: Entitlements | null;
  readonly collection: Collection | null;
  readonly wishlist: Wishlist | null;
  /** The collection, or the wishlist, couldn't be read and none is held: say so, offer Try again. */
  readonly collectionFailed: boolean;
  readonly wishlistFailed: boolean;
  /** The store's display price for each product it knows. */
  readonly prices: Readonly<Record<string, string>>;
  /** The first load failed (offline, or the server didn't answer). */
  readonly failed: boolean;
  readonly loading: boolean;
  readonly reload: () => void;
  readonly setEntitlements: (next: Entitlements) => void;
  readonly setMe: (next: Me) => void;
  readonly refreshCollection: () => Promise<void>;
  readonly refreshWishlist: () => Promise<void>;
  /** Asks the store for the prices of these products (once each). */
  readonly loadPrices: (products: readonly StoreProductId[]) => void;
  /** An item of the catalogue by its id. */
  readonly item: (id: string) => ShopItem | null;
  /** A product's price as shown: the store's own, or a placeholder holding its place. */
  readonly priceText: (product: StoreProductId) => string;
}

const ShopContext = createContext<ShopData | null>(null);

/** Starts the store for this person once per app run, not once per screen. */
const stores = new Map<string, Store>();
export function storeFor(person: string): Store {
  let store = stores.get(person);
  if (!store) {
    store = revenueCatStore(person);
    stores.set(person, store);
  }
  return store;
}

export function ShopProvider({ children }: { readonly children: ReactNode }) {
  const data = useDataClient();
  const client = data.api;
  const person = useSession().person?.id ?? null;
  const api = useMemo(() => shopApi(client), [client]);
  const store = useMemo(() => (person === null ? noStore : storeFor(person)), [person]);
  const [me, setMe] = useState<Me | null>(null);
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [cart, setCart] = useState<ShopCart | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [wishlist, setWishlist] = useState<Wishlist | null>(null);
  const [collectionFailed, setCollectionFailed] = useState(false);
  const [wishlistFailed, setWishlistFailed] = useState(false);
  const [prices, setPrices] = useState<Readonly<Record<string, string>>>({});
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const asked = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([api.catalog(), api.cart(), api.entitlements(), client.me()]).then(
      ([cat, crt, ent, who]) => {
        if (!live) return;
        setCatalog(cat);
        setCart(crt);
        setEntitlements(ent);
        setMe(who);
        setFailed(false);
        setLoading(false);
      },
      () => {
        if (!live) return;
        setFailed(true);
        setLoading(false);
      },
    );
    // The collection and wishlist aren't needed for the first frame.
    api.collection().then(
      (c) => {
        if (!live) return;
        setCollection(c);
        setCollectionFailed(false);
      },
      () => live && setCollectionFailed(true),
    );
    api.wishlist().then(
      (w) => {
        if (!live) return;
        setWishlist(w);
        setWishlistFailed(false);
      },
      () => live && setWishlistFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, client, tick]);

  // Gifts paid for but not on a friend's step yet are picked up once per opening.
  useEffect(() => {
    if (person !== null) void resumePendingGifts(person, api, data);
  }, [api, data, person]);

  // Back from the App Store's own sheets or Settings (a cancellation, a renewal, Ask to Buy), the
  // server may know more: entitlements and the collection are read again on coming back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      api.entitlements().then(setEntitlements, () => undefined);
      api.collection().then(setCollection, () => undefined);
    });
    return () => sub.remove();
  }, [api]);

  const loadPrices = useCallback(
    (products: readonly StoreProductId[]) => {
      const fresh = products.filter((p) => !asked.current.has(p));
      if (fresh.length === 0 || !store.available) return;
      for (const p of fresh) asked.current.add(p);
      void store.prices(fresh).then((found) => setPrices((all) => ({ ...all, ...found })));
    },
    [store],
  );

  const refreshCollection = useCallback(
    () =>
      api.collection().then(
        (c) => {
          setCollection(c);
          setCollectionFailed(false);
        },
        () => setCollectionFailed(true),
      ),
    [api],
  );
  const refreshWishlist = useCallback(
    () =>
      api.wishlist().then(
        (w) => {
          setWishlist(w);
          setWishlistFailed(false);
        },
        () => setWishlistFailed(true),
      ),
    [api],
  );
  const byId = useMemo(() => new Map((catalog?.items ?? []).map((i) => [i.item, i])), [catalog]);
  const item = useCallback((id: string) => byId.get(id) ?? null, [byId]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const { t } = useLocale();
  const priceText = useCallback(
    (product: StoreProductId) => {
      const shown = priceShown(prices, product, store.available);
      return shown.kind === 'price'
        ? shown.text
        : t(shown.kind === 'loading' ? 'shop.price.loading' : 'shop.price.none');
    },
    [prices, store.available, t],
  );

  const value = useMemo<ShopData | null>(
    () =>
      person === null
        ? null
        : {
            person,
            api,
            store,
            me,
            catalog,
            cart,
            entitlements,
            collection,
            wishlist,
            collectionFailed,
            wishlistFailed,
            prices,
            failed,
            loading,
            reload,
            setEntitlements,
            setMe,
            refreshCollection,
            refreshWishlist,
            loadPrices,
            item,
            priceText,
          },
    [
      person,
      api,
      store,
      me,
      catalog,
      cart,
      entitlements,
      collection,
      wishlist,
      collectionFailed,
      wishlistFailed,
      prices,
      failed,
      loading,
      reload,
      refreshCollection,
      refreshWishlist,
      loadPrices,
      item,
      priceText,
    ],
  );
  return value === null ? null : (
    <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
  );
}

/** The shop's data; only inside the shop's screens. */
export function useShop(): ShopData {
  const value = useContext(ShopContext);
  if (!value) throw new Error('useShop needs the ShopProvider of the shop’s layout');
  return value;
}

/** Whether the person owns an item now. */
export function useOwns(): (item: string) => boolean {
  const { entitlements } = useShop();
  const owned = useMemo(() => new Set(entitlements?.owned ?? []), [entitlements]);
  return useCallback((item: string) => owned.has(item), [owned]);
}
