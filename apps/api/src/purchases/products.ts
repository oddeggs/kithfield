import { PATRON_PRODUCTS, type Patronage, type Store } from '@kithfield/contracts';

/* What each patronage product is, and the stores' names as the contract spells them. */

export type PatronTier = Patronage['tier'];
export type PatronPeriod = NonNullable<Patronage['period']>;

const PATRON: Readonly<Record<string, { tier: PatronTier; period: PatronPeriod }>> = {
  [PATRON_PRODUCTS.patronMonthly]: { tier: 'patron', period: 'month' },
  [PATRON_PRODUCTS.patronYearly]: { tier: 'patron', period: 'year' },
  [PATRON_PRODUCTS.farmPlusMonthly]: { tier: 'farm_plus', period: 'month' },
  [PATRON_PRODUCTS.founding]: { tier: 'founding', period: 'lifetime' },
};

/** The tier and period a patronage product gives, or null for anything else. */
export const patronProduct = (product: string) => PATRON[product] ?? null;

/** Auto-renewing patronage: everything but Founding Farmer, which is bought once. */
export const isSubscription = (product: string): boolean =>
  patronProduct(product) !== null && product !== PATRON_PRODUCTS.founding;

/** The store's name in our contract; null for one we don't name. */
export const storeOf = (store: string | null | undefined): Store | null => {
  switch (store?.toLowerCase() ?? '') {
    case 'app_store':
    case 'mac_app_store':
      return 'app_store';
    case 'play_store':
      return 'play_store';
    case 'stripe':
      return 'stripe';
    case 'promotional':
      return 'promotional';
    default:
      return null;
  }
};

/** A consumable that pays for a gift or a chip-in pledge. */
export const isConsumable = (product: string): boolean =>
  /^kf\.(gift|chipin)\.\d{1,5}$/.test(product);
