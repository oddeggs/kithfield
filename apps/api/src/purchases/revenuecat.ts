import {
  KNOWN_REVENUECAT_EVENTS,
  PATRON_PRODUCTS,
  type RevenueCatEvent,
} from '@kithfield/contracts';
import { z } from 'zod';

import type { Bindings } from '../env';
import { itemOfProduct } from './catalog';
import type { SubState } from './entitlements';
import { isConsumable, isSubscription, storeOf } from './products';

/*
 * RevenueCat's news, folded into D1: subscriptions (patronage), what people bought for themselves
 * and the consumable transactions that pay for gifts and chip-ins. The webhook and the app's
 * `POST /v1/purchases/sync` (RevenueCat's REST API) end in the same statements.
 */

const known: ReadonlySet<string> = new Set(KNOWN_REVENUECAT_EVENTS);

/** Writes one subscription's state, unless a newer event already did. */
const subscriptionWrite = (
  db: D1Database,
  person: string,
  product: string,
  w: {
    state: SubState;
    since: number;
    until: number | null;
    store: string | null;
    eventAt: number;
  },
  now: number,
) =>
  db
    .prepare(
      `INSERT INTO subscriptions (person_id, product, state, since, until, store, event_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (person_id, product) DO UPDATE SET
         state = excluded.state,
         until = CASE WHEN excluded.state = 'lapsed' THEN NULL
                      ELSE coalesce(excluded.until, subscriptions.until) END,
         since = CASE WHEN subscriptions.state = 'lapsed' AND excluded.state <> 'lapsed'
                      THEN excluded.since ELSE subscriptions.since END,
         store = coalesce(excluded.store, subscriptions.store),
         event_at = excluded.event_at,
         updated_at = excluded.updated_at
       WHERE excluded.event_at >= subscriptions.event_at`,
    )
    .bind(
      person,
      product,
      w.state,
      w.since,
      w.state === 'lapsed' ? null : w.until,
      w.store,
      w.eventAt,
      now,
    );

const ownBought = (db: D1Database, person: string, item: string, at: number) =>
  db
    .prepare(
      `INSERT OR IGNORE INTO owned_items (person_id, item, via, from_id, at) VALUES (?, ?, 'bought', NULL, ?)`,
    )
    .bind(person, item, at);

const recordTransaction = (
  db: D1Database,
  person: string,
  id: string,
  product: string,
  at: number,
  environment: string | null,
) =>
  db
    .prepare(
      `INSERT INTO store_transactions (id, person_id, product, at, environment)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    )
    .bind(id, person, product, at, environment);

/** A one-off purchase: an item for yourself, Founding Farmer, or a gift or chip-in consumable. */
const purchaseWrites = (
  db: D1Database,
  person: string,
  product: string,
  p: { transaction: string | null; at: number; store: string | null; environment: string | null },
  now: number,
): D1PreparedStatement[] => {
  const out: D1PreparedStatement[] = [];
  if (p.transaction !== null) {
    out.push(recordTransaction(db, person, p.transaction, product, p.at, p.environment));
  }
  const item = itemOfProduct(product);
  if (item !== null) out.push(ownBought(db, person, item.item, p.at));
  if (product === PATRON_PRODUCTS.founding) {
    out.push(
      subscriptionWrite(
        db,
        person,
        product,
        { state: 'active', since: p.at, until: null, store: storeOf(p.store), eventAt: p.at },
        now,
      ),
    );
  }
  return out;
};

/** A one-off purchase refunded: an item bought for yourself goes; a used consumable is marked. */
const refundWrites = (
  db: D1Database,
  person: string,
  product: string,
  transaction: string | null,
  eventAt: number,
  now: number,
): D1PreparedStatement[] => {
  const out: D1PreparedStatement[] = [];
  if (transaction !== null) {
    out.push(
      db
        .prepare('UPDATE store_transactions SET refunded = 1 WHERE id = ? AND person_id = ?')
        .bind(transaction, person),
    );
  }
  const item = itemOfProduct(product);
  if (item !== null) {
    out.push(
      db
        .prepare(`DELETE FROM owned_items WHERE person_id = ? AND item = ? AND via = 'bought'`)
        .bind(person, item.item),
    );
  }
  if (product === PATRON_PRODUCTS.founding) {
    out.push(
      subscriptionWrite(
        db,
        person,
        product,
        { state: 'lapsed', since: eventAt, until: null, store: null, eventAt },
        now,
      ),
    );
  }
  return out;
};

const ACTIVE_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'REFUND_REVERSED',
]);

/** The state an event leaves a subscription in, or null when it says nothing about one. */
const subscriptionState = (event: RevenueCatEvent): SubState | null => {
  if (ACTIVE_TYPES.has(event.type)) return 'active';
  switch (event.type) {
    case 'CANCELLATION':
      return event.cancel_reason === 'CUSTOMER_SUPPORT' ? 'lapsed' : 'ending';
    case 'SUBSCRIPTION_PAUSED':
      return 'ending';
    case 'BILLING_ISSUE':
      return 'grace';
    case 'EXPIRATION':
      return 'lapsed';
    default:
      return null;
  }
};

/** Moves everything one person holds to another, as RevenueCat's `TRANSFER` does. */
export const transferWrites = (
  db: D1Database,
  from: string,
  into: string,
): D1PreparedStatement[] => [
  db
    .prepare(
      `INSERT OR IGNORE INTO subscriptions (person_id, product, state, since, until, store, event_at, updated_at)
       SELECT ?, product, state, since, until, store, event_at, updated_at FROM subscriptions WHERE person_id = ?`,
    )
    .bind(into, from),
  db.prepare('DELETE FROM subscriptions WHERE person_id = ?').bind(from),
  db
    .prepare(
      `INSERT OR IGNORE INTO owned_items (person_id, item, via, from_id, at)
       SELECT ?, item, via, from_id, at FROM owned_items WHERE person_id = ?`,
    )
    .bind(into, from),
  db.prepare('DELETE FROM owned_items WHERE person_id = ?').bind(from),
  db.prepare('UPDATE store_transactions SET person_id = ? WHERE person_id = ?').bind(into, from),
];

const personExists = async (db: D1Database, person: string) =>
  (await db.prepare('SELECT 1 FROM people WHERE id = ?').bind(person).first()) !== null;

export type EventOutcome = 'applied' | 'ignored' | 'duplicate';

/** The statements one webhook event makes, beyond recording that it was seen. */
const writesFor = async (
  db: D1Database,
  event: RevenueCatEvent,
  now: number,
): Promise<D1PreparedStatement[] | null> => {
  const person = event.app_user_id;
  const eventAt = event.event_timestamp_ms;
  if (event.type === 'TRANSFER') {
    const into = event.transferred_to?.[0];
    if (into === undefined || !(await personExists(db, into))) return null;
    return (event.transferred_from ?? [])
      .filter((from) => from !== into)
      .flatMap((from) => transferWrites(db, from, into));
  }
  if (!(await personExists(db, person))) return null;
  const product =
    event.type === 'PRODUCT_CHANGE' ? (event.new_product_id ?? event.product_id) : event.product_id;
  if (product === null || product === undefined) return null;
  const transaction = event.transaction_id ?? null;
  const at = event.purchased_at_ms ?? eventAt;

  if (!isSubscription(product)) {
    if (event.type === 'NON_RENEWING_PURCHASE' || event.type === 'INITIAL_PURCHASE') {
      if (
        itemOfProduct(product) === null &&
        !isConsumable(product) &&
        product !== PATRON_PRODUCTS.founding
      ) {
        return null;
      }
      return purchaseWrites(
        db,
        person,
        product,
        { transaction, at, store: event.store ?? null, environment: event.environment },
        now,
      );
    }
    if (event.type === 'CANCELLATION') {
      return refundWrites(db, person, product, transaction, eventAt, now);
    }
    if (event.type === 'REFUND_REVERSED') {
      return purchaseWrites(
        db,
        person,
        product,
        { transaction, at, store: event.store ?? null, environment: event.environment },
        now,
      );
    }
    return null;
  }

  const state = subscriptionState(event);
  if (state === null) return null;
  const out = [
    subscriptionWrite(
      db,
      person,
      product,
      {
        state,
        since: at,
        until: event.expiration_at_ms ?? null,
        store: storeOf(event.store),
        eventAt,
      },
      now,
    ),
  ];
  // A change of plan: the old one runs out on its own date.
  if (event.type === 'PRODUCT_CHANGE' && event.product_id && event.product_id !== product) {
    out.push(
      db
        .prepare(
          `UPDATE subscriptions SET state = 'ending', event_at = ?, updated_at = ?
           WHERE person_id = ? AND product = ? AND state = 'active' AND event_at <= ?`,
        )
        .bind(eventAt, now, person, event.product_id, eventAt),
    );
  }
  return out;
};

/** Applies one webhook event once. Unknown kinds and unknown people are acknowledged and skipped. */
export const applyRevenueCatEvent = async (
  db: D1Database,
  event: RevenueCatEvent,
  now: number,
): Promise<EventOutcome> => {
  if (!known.has(event.type) || event.type === 'TEST') return 'ignored';
  if (
    (await db.prepare('SELECT 1 FROM revenuecat_events WHERE id = ?').bind(event.id).first()) !==
    null
  ) {
    return 'duplicate';
  }
  const writes = await writesFor(db, event, now);
  const seen = db
    .prepare('INSERT INTO revenuecat_events (id, at) VALUES (?, ?)')
    .bind(event.id, now);
  try {
    await db.batch([seen, ...(writes ?? [])]);
  } catch (error) {
    // The same event delivered twice at once: the other delivery applied it.
    if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) return 'duplicate';
    throw error;
  }
  return writes === null ? 'ignored' : 'applied';
};

/* RevenueCat's REST API: `GET /v1/subscribers/{app_user_id}`, read as far as we use it. */

const isoMs = z
  .string()
  .nullish()
  .transform((s) => (s === null || s === undefined ? null : Date.parse(s)))
  .transform((ms) => (ms === null || Number.isNaN(ms) ? null : ms));

const Subscriber = z.object({
  subscriber: z.object({
    subscriptions: z
      .record(
        z.string(),
        z.object({
          expires_date: isoMs,
          purchase_date: isoMs,
          original_purchase_date: isoMs,
          store: z.string().nullish(),
          unsubscribe_detected_at: isoMs,
          billing_issues_detected_at: isoMs,
          refunded_at: isoMs,
        }),
      )
      .default({}),
    non_subscriptions: z
      .record(
        z.string(),
        z.array(
          z.object({
            id: z.string().nullish(),
            purchase_date: isoMs,
            store: z.string().nullish(),
            store_transaction_id: z.string().nullish(),
            is_sandbox: z.boolean().nullish(),
          }),
        ),
      )
      .default({}),
  }),
});
export type Subscriber = z.infer<typeof Subscriber>;

/** The statements that make D1 match what RevenueCat says a person has. */
export const subscriberWrites = (
  db: D1Database,
  person: string,
  subscriber: Subscriber,
  now: number,
): D1PreparedStatement[] => {
  const out: D1PreparedStatement[] = [];
  for (const [product, s] of Object.entries(subscriber.subscriber.subscriptions)) {
    if (!isSubscription(product)) continue;
    const until = s.expires_date;
    const state: SubState =
      s.refunded_at !== null
        ? 'lapsed'
        : until !== null && until <= now
          ? 'lapsed'
          : s.billing_issues_detected_at !== null
            ? 'grace'
            : s.unsubscribe_detected_at !== null
              ? 'ending'
              : 'active';
    out.push(
      subscriptionWrite(
        db,
        person,
        product,
        {
          state,
          since: s.original_purchase_date ?? s.purchase_date ?? now,
          until,
          store: storeOf(s.store),
          eventAt: now,
        },
        now,
      ),
    );
  }
  for (const [product, purchases] of Object.entries(subscriber.subscriber.non_subscriptions)) {
    if (
      itemOfProduct(product) === null &&
      !isConsumable(product) &&
      product !== PATRON_PRODUCTS.founding
    ) {
      continue;
    }
    for (const p of purchases) {
      out.push(
        ...purchaseWrites(
          db,
          person,
          product,
          {
            transaction: p.store_transaction_id ?? null,
            at: p.purchase_date ?? now,
            store: p.store ?? null,
            environment:
              p.is_sandbox === true ? 'SANDBOX' : p.is_sandbox === false ? 'PRODUCTION' : null,
          },
          now,
        ),
      );
    }
  }
  return out;
};

let warnedNoKey = false;

/**
 * Asks RevenueCat what the person has and writes it to D1. False when it can't: no secret set
 * (answered from D1 alone, said once in the log) or RevenueCat didn't answer.
 */
export const syncFromRevenueCat = async (
  env: Pick<Bindings, 'DB' | 'REVENUECAT_SECRET_KEY'>,
  person: string,
  now: number,
  fetcher: typeof fetch = fetch,
): Promise<boolean> => {
  const key = env.REVENUECAT_SECRET_KEY;
  if (key === undefined || key === '') {
    if (!warnedNoKey) console.warn('purchases sync: REVENUECAT_SECRET_KEY is unset; D1 only');
    warnedNoKey = true;
    return false;
  }
  const response = await fetcher(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(person)}`,
    { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
  ).catch(() => null);
  if (response === null || !response.ok) {
    console.error('purchases sync: RevenueCat did not answer', { status: response?.status ?? 0 });
    return false;
  }
  const parsed = Subscriber.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    console.error('purchases sync: unreadable subscriber');
    return false;
  }
  const writes = subscriberWrites(env.DB, person, parsed.data, now);
  if (writes.length > 0) await env.DB.batch(writes);
  return true;
};
