import type { Entitlements, RevenueCatEvent } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { expect } from 'vitest';

import { call } from '../../src/auth/testing/client';
import { api, type Person } from '../farm/support/doubles';

/* RevenueCat as the purchases tests see it: contract-shaped webhooks, posted with its secret. */

let events = 0;

export const rcEvent = (
  person: string,
  type: string,
  product: string,
  extra: Partial<RevenueCatEvent> = {},
): RevenueCatEvent => {
  events += 1;
  const now = Date.now();
  return {
    id: `evt-${Date.now().toString(36)}-${events}`,
    type,
    app_user_id: person,
    product_id: product,
    event_timestamp_ms: now + events,
    purchased_at_ms: now,
    expiration_at_ms: now + 30 * 86_400_000,
    environment: 'SANDBOX',
    store: 'APP_STORE',
    transaction_id: `tx-${events}-${Math.random().toString(36).slice(2, 8)}`,
    ...extra,
  };
};

export const postWebhook = (event: RevenueCatEvent, auth = env.REVENUECAT_WEBHOOK_AUTH ?? '') =>
  call('/v1/webhooks/revenuecat', {
    body: { api_version: '1.0', event },
    headers: { authorization: auth },
  });

/** Posts an event and expects it acknowledged. */
export const tell = async (event: RevenueCatEvent) => {
  const response = await postWebhook(event);
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json<{ outcome: string }>();
};

export const entitlements = async (person: Person) => {
  const r = await api(person, 'GET', '/v1/me/entitlements');
  expect(r.status).toBe(200);
  return r.body as Entitlements;
};

/** A consumable bought through the store and told to us, ready to pay for a gift or pledge. */
export const boughtConsumable = async (person: Person, product: string) => {
  const event = rcEvent(person.id, 'NON_RENEWING_PURCHASE', product, { expiration_at_ms: null });
  await tell(event);
  return event.transaction_id ?? '';
};
