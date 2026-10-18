import { z } from 'zod';

import { Id, PersonId } from '../primitives';

/*
 * Bodies other services post to us, as far as we read them. These keep the services' own key
 * names (RevenueCat's are snake_case). Each is checked for its sender before it is parsed, and an
 * event type we don't know is acknowledged and ignored, never an error.
 */

/* RevenueCat: `POST /v1/webhooks/revenuecat`, with the shared secret in `Authorization`. */

/** The RevenueCat event types the purchases code acts on. Any other type is acknowledged. */
export const KNOWN_REVENUECAT_EVENTS = [
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_PAUSED',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'TRANSFER',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'REFUND_REVERSED',
  'TEST',
] as const;

const rcId = z.string().min(1).max(256);
const rcMs = z.int().min(0).nullish();

/**
 * One RevenueCat event. `app_user_id` is our person id: the app logs in to RevenueCat with it,
 * anonymous people too, and a person merge moves purchases with a `TRANSFER`. `price` is in USD;
 * the purchased currency's amount is `price_in_purchased_currency`.
 */
export const RevenueCatEvent = z.object({
  id: rcId,
  type: z.string().regex(/^[A-Z_]{1,64}$/),
  app_user_id: rcId,
  original_app_user_id: rcId.nullish(),
  aliases: z.array(rcId).max(100).nullish(),
  product_id: rcId.nullish(),
  new_product_id: rcId.nullish(),
  entitlement_ids: z.array(rcId).max(20).nullish(),
  period_type: z.string().max(32).nullish(),
  purchased_at_ms: rcMs,
  expiration_at_ms: rcMs,
  event_timestamp_ms: z.int().min(0),
  environment: z.enum(['SANDBOX', 'PRODUCTION']),
  store: z.string().max(32).nullish(),
  transaction_id: rcId.nullish(),
  original_transaction_id: rcId.nullish(),
  is_family_share: z.boolean().nullish(),
  cancel_reason: z.string().max(64).nullish(),
  expiration_reason: z.string().max(64).nullish(),
  price: z.number().nullish(),
  currency: z.string().max(8).nullish(),
  price_in_purchased_currency: z.number().nullish(),
  transferred_from: z.array(rcId).max(100).nullish(),
  transferred_to: z.array(rcId).max(100).nullish(),
});
export type RevenueCatEvent = z.infer<typeof RevenueCatEvent>;

export const RevenueCatWebhook = z.object({
  api_version: z.string().max(16),
  event: RevenueCatEvent,
});
export type RevenueCatWebhook = z.infer<typeof RevenueCatWebhook>;

/* Stripe: `POST /v1/webhooks/stripe`, checked against `Stripe-Signature` first. The book only. */

/** The Stripe event types the book order acts on. */
export const KNOWN_STRIPE_EVENTS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.amount_capturable_updated',
  'payment_intent.succeeded',
  'payment_intent.canceled',
  'charge.refunded',
] as const;

/** What we put in each Checkout session's and payment's `metadata`, to find the order again. */
export const BookPaymentMetadata = z.object({ order: Id, person: PersonId });
export type BookPaymentMetadata = z.infer<typeof BookPaymentMetadata>;

/** A Stripe event; its object keeps every field Stripe sends, and we read only a few. */
export const StripeWebhook = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9]{1,255}$/),
  type: z.string().regex(/^[a-z_.]{1,100}$/),
  livemode: z.boolean(),
  created: z.int().min(0),
  data: z.object({
    object: z.looseObject({
      id: z.string().min(1).max(255),
      object: z.string().min(1).max(64),
      metadata: z.record(z.string().max(40), z.string().max(500)).optional(),
    }),
  }),
});
export type StripeWebhook = z.infer<typeof StripeWebhook>;

/* LiveKit: `POST /v1/webhooks/livekit`, checked against its signed `Authorization` token first. */

/** The LiveKit events the fire acts on: who sits down and heads home, and the room closing. */
export const KNOWN_LIVEKIT_EVENTS = [
  'room_started',
  'room_finished',
  'participant_joined',
  'participant_left',
  'participant_connection_aborted',
] as const;

/**
 * A LiveKit event. Rooms are named by `fireRoomOf`; a participant's identity is their person id.
 * `createdAt` is Unix seconds, which LiveKit sends as a string.
 */
export const LiveKitWebhook = z.object({
  event: z.string().regex(/^[a-z_]{1,64}$/),
  id: z.string().min(1).max(128),
  createdAt: z.union([z.string().regex(/^\d{1,15}$/), z.int().min(0)]),
  room: z.object({ name: z.string().min(1).max(128), sid: z.string().max(64) }).optional(),
  participant: z
    .object({
      identity: z.string().min(1).max(128),
      sid: z.string().max(64),
      attributes: z.record(z.string().max(64), z.string().max(256)).optional(),
    })
    .optional(),
});
export type LiveKitWebhook = z.infer<typeof LiveKitWebhook>;
