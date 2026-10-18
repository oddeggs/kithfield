import { BookPaymentMetadata, KNOWN_STRIPE_EVENTS, type StripeWebhook } from '@kithfield/contracts';

/*
 * Stripe's webhook for the printed scrapbook. The signature is checked against the raw body
 * before anything is parsed. Only book shares are acted on, found by the order and person in the
 * payment's metadata; any other event is acknowledged and ignored.
 */

/** Stripe signs `t.<raw body>`; an event older than this is refused, as Stripe recommends. */
export const STRIPE_TOLERANCE_S = 300;

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/** Compares two strings in time that doesn't depend on where they differ. */
export const sameText = (a: string, b: string): boolean => {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

export const stripeSignature = async (secret: string, timestamp: string, body: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)),
  );
};

/** Whether `header` (`Stripe-Signature: t=…,v1=…`) signs `body` with `secret`, recently. */
export const verifyStripe = async (
  secret: string,
  header: string | undefined,
  body: string,
  nowMs: number,
): Promise<boolean> => {
  if (header === undefined) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (t === undefined || !/^\d{1,12}$/.test(t) || signatures.length === 0) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > STRIPE_TOLERANCE_S) return false;
  const expected = await stripeSignature(secret, t, body);
  return signatures.some((s) => sameText(s, expected));
};

const known: ReadonlySet<string> = new Set(KNOWN_STRIPE_EVENTS);

type ShareState = 'authorised' | 'paid' | 'released' | 'refunded';

const shareStateOf = (type: string): ShareState | null => {
  switch (type) {
    case 'payment_intent.amount_capturable_updated':
      return 'authorised';
    case 'checkout.session.completed':
    case 'payment_intent.succeeded':
      return 'paid';
    case 'checkout.session.expired':
    case 'payment_intent.canceled':
      return 'released';
    case 'charge.refunded':
      return 'refunded';
    default:
      return null;
  }
};

/** Applies one Stripe event to a book share. Answers whether anything changed. */
export const applyStripeEvent = async (
  db: D1Database,
  event: StripeWebhook,
  now: number,
): Promise<boolean> => {
  if (!known.has(event.type)) return false;
  const state = shareStateOf(event.type);
  const meta = BookPaymentMetadata.safeParse(event.data.object.metadata ?? {});
  if (state === null || !meta.success) return false;
  // A checkout that completes with a hold (a split share) is authorised, not yet paid.
  const held =
    event.type === 'checkout.session.completed' &&
    (event.data.object as { payment_status?: unknown }).payment_status === 'unpaid';
  const result = await db
    .prepare(
      `UPDATE book_shares SET state = ?, provider_ref = coalesce(provider_ref, ?), at = ?
       WHERE order_id = ? AND person_id = ?`,
    )
    .bind(held ? 'authorised' : state, event.data.object.id, now, meta.data.order, meta.data.person)
    .run();
  return result.meta.changes > 0;
};
