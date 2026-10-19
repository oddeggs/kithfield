import type {
  BookCheckout,
  BookOrder,
  BookOrderRequest,
  BookQuote,
  FarmId,
  PersonId,
} from '@kithfield/contracts';

import type { Bindings } from '../env';
import { roleOf } from '../farm/d1';
import { farmStub } from '../farm/http';
import { BOOK } from './config';

/*
 * The printed scrapbook: a physical book, so it is paid outside the stores. Checkout goes through
 * a provider seam. No provider is set up yet (Stripe isn't offered to a Vietnamese business; the
 * founder is choosing another route), so ordering answers "not available yet" and records
 * nothing. The order rows, the share states and the webhook are ready for the provider.
 */

/** How the year's book is checked out. One implementation per provider. */
export interface BookCheckoutProvider {
  /** A checkout page for one person's share, or null when this provider can't take orders. */
  checkout(input: {
    order: string;
    farm: FarmId;
    person: PersonId;
    amount: { amount: number; currency: string };
    split: boolean;
  }): Promise<BookCheckout | null>;
}

/** No provider yet: every order answers "not available yet". */
const notYet: BookCheckoutProvider = { checkout: () => Promise.resolve(null) };

/** The provider for this environment. */
export const bookCheckoutProvider = (_env: Bindings): BookCheckoutProvider => notYet;

/** Pages for a year: four for each hangout on top of the binding's 16, at least 24, in fours. */
export const pagesFor = (hangouts: number): number => {
  const raw = Math.max(BOOK.minPages, 16 + hangouts * 4);
  return Math.ceil(raw / 4) * 4;
};

export const priceFor = (pages: number) => ({
  amount: BOOK.base + BOOK.perPage * Math.max(0, pages - BOOK.minPages),
  currency: BOOK.currency,
});

/** The scrapbook pages pressed on the farm in a year: one per hangout kept. */
const pressedIn = async (env: Bindings, farm: FarmId, person: PersonId, year: number) => {
  const stub = farmStub(env, farm);
  let after = 0;
  let count = 0;
  for (let i = 0; i < 20; i++) {
    const page = await stub.page(person, { after, limit: 200, kinds: ['scrapbook_page'] });
    if (page === null) return 0;
    for (const event of page.events) {
      const pressed = (event.payload as { action?: unknown }).action === 'pressed';
      if (pressed && (event.day ?? '').startsWith(`${year}-`)) count++;
    }
    const last = page.events[page.events.length - 1];
    if (!page.more || last === undefined) break;
    after = last.seq;
  }
  return count;
};

/** `GET /v1/farms/:id/book?year=`. */
export const bookQuote = async (
  env: Bindings,
  person: PersonId,
  farm: FarmId,
  year: number,
): Promise<BookQuote> => {
  const hangouts = await pressedIn(env, farm, person, year);
  const pages = pagesFor(hangouts);
  return {
    farm,
    year,
    hangouts,
    pages,
    sizeCm: BOOK.sizeCm,
    cloths: [...BOOK.cloths],
    price: priceFor(pages),
  };
};

/** `POST /v1/farms/:id/book/orders`: a checkout for the asker's share, or null when not yet. */
export const orderBook = async (
  env: Bindings,
  person: PersonId,
  farm: FarmId,
  req: BookOrderRequest,
): Promise<BookCheckout | null> => {
  const provider = bookCheckoutProvider(env);
  const quote = await bookQuote(env, person, farm, req.year);
  return provider.checkout({
    order: crypto.randomUUID(),
    farm,
    person,
    amount: quote.price,
    split: req.split,
  });
};

type OrderRow = {
  id: string;
  farm_id: string;
  year: number;
  cloth: string;
  by_id: string;
  state: BookOrder['state'];
  split: number;
  share_count: number;
  closes_at: number | null;
};

/** `GET /v1/book-orders/:order`: for everyone on the farm; amounts stay private. */
export const bookOrder = async (
  db: D1Database,
  person: PersonId,
  order: string,
): Promise<BookOrder | null> => {
  const row = await db
    .prepare('SELECT * FROM book_orders WHERE id = ?')
    .bind(order)
    .first<OrderRow>();
  if (row === null || (await roleOf(db, row.farm_id, person)) === null) return null;
  const { results } = await db
    .prepare(
      `SELECT person_id FROM book_shares WHERE order_id = ? AND state IN ('authorised', 'paid')
       ORDER BY at`,
    )
    .bind(order)
    .all<{ person_id: string }>();
  return {
    order: row.id,
    farm: row.farm_id,
    year: row.year,
    cloth: row.cloth,
    by: row.by_id,
    state: row.state,
    split:
      row.split === 1 && row.closes_at !== null
        ? {
            people: results.map((r) => r.person_id),
            filled: Math.min(1, results.length / Math.max(1, row.share_count)),
            closesAt: row.closes_at,
          }
        : null,
  };
};
