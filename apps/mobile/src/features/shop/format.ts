import type { EpochMs, LocalDate, Season, ShopItem, StoreProductId } from '@kithfield/contracts';
import type { Language } from '@kithfield/i18n';

/* Pure helpers behind the shop screens: what to say and in what order, never how to draw. */

const tag = (language: Language) => (language === 'vi' ? 'vi-VN' : 'en-GB');

/** A month's name in the reader's language (`June`, `tháng 6`). */
export function monthName(language: Language, at: EpochMs | LocalDate): string {
  const date = typeof at === 'number' ? new Date(at) : new Date(`${at}T12:00:00Z`);
  return new Intl.DateTimeFormat(tag(language), { month: 'long', timeZone: 'UTC' }).format(date);
}

/** A day as the patron screens write it: `14 Oct 2027`. */
export function dayMonthYear(language: Language, at: EpochMs): string {
  return new Intl.DateTimeFormat(tag(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(at));
}

/** The item's name with a small first letter, for the middle of a sentence ("The lighthouse"). */
export function lowerFirst(name: string): string {
  return name.length === 0 ? name : name.charAt(0).toLocaleLowerCase() + name.slice(1);
}

/** How full a chip-in reads: a word, never an amount. */
export type FillWord = 'start' | 'filling' | 'nearly' | 'covered';

export function fillWord(filled: number): FillWord {
  if (filled >= 1) return 'covered';
  if (filled >= 0.66) return 'nearly';
  if (filled >= 0.33) return 'filling';
  return 'start';
}

/** "A, B or C" in the reader's language, from the vote's options. */
export function orList(items: readonly string[], or: (rest: string, last: string) => string) {
  if (items.length <= 1) return items[0] ?? '';
  return or(items.slice(0, -1).join(', '), items[items.length - 1] ?? '');
}

/** "Pip, Bea and Otis", joined the reader's way (`shop.and`). */
export function andList(names: readonly string[], and: (rest: string, last: string) => string) {
  return orList(names, and);
}

/** The cart tab an item sits under. */
export type CartTab = 'week' | 'cottage' | 'companion' | 'coat' | 'little_thing' | 'theme';

/** This week's items, or every item of one kind, in the catalogue's order. */
export function itemsFor(
  tab: CartTab,
  items: readonly ShopItem[],
  week: readonly string[],
): readonly ShopItem[] {
  if (tab === 'week') {
    const byId = new Map(items.map((i) => [i.item, i]));
    return week.flatMap((id) => {
      const found = byId.get(id);
      return found ? [found] : [];
    });
  }
  return items.filter((i) => i.kind === tab);
}

/** Whether an item can be bought for yourself this week. */
export function onCartNow(item: ShopItem, week: readonly string[]): boolean {
  return week.includes(item.item);
}

/**
 * The note under the cart: one of this week's items that was here before, with when it was and
 * when it's back. Prefers the first that has both.
 */
export function roundNote(
  items: readonly ShopItem[],
): { item: ShopItem; last: LocalDate | null; back: Season } | null {
  const withBack = items.filter((i) => i.back !== null);
  const pick = withBack.find((i) => i.lastOnCart !== null) ?? withBack[0];
  if (!pick || pick.back === null) return null;
  return { item: pick, last: pick.lastOnCart, back: pick.back.season };
}

/** The products whose prices a list of items shows. */
export function productsOf(items: readonly ShopItem[]): StoreProductId[] {
  return items.flatMap((i) => (i.product === null ? [] : [i.product]));
}

/** A price as shown: the store's own, held in place while the store answers, or none to be had. */
export type PriceShown =
  | { readonly kind: 'price'; readonly text: string }
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' };

/**
 * What a price reads. Prices come only from the store; while it answers the price keeps its place
 * (a quiet placeholder, never dropped), and with no store on the phone nothing can be bought.
 */
export function priceShown(
  prices: Readonly<Record<string, string>>,
  product: StoreProductId,
  storeAvailable: boolean,
): PriceShown {
  if (!storeAvailable) return { kind: 'none' };
  const text = prices[product];
  return text === undefined ? { kind: 'loading' } : { kind: 'price', text };
}

/** The cart's first two rows (two across), which the note sits under; then the rest. */
export function splitForNote<T>(items: readonly T[], first = 4): [T[], T[]] {
  return [items.slice(0, first), items.slice(first)];
}
