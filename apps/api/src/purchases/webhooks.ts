import { RevenueCatWebhook, StripeWebhook } from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { fail } from '../farm/http';
import { applyRevenueCatEvent } from './revenuecat';
import { applyStripeEvent, sameText, verifyStripe } from './stripe';

/*
 * What the stores and the book's checkout tell us. Each is checked for its sender before its body
 * is read; an event we don't act on is acknowledged, never an error, so nobody retries it.
 */

export const webhookRoutes = (): Hono<SessionEnv> => {
  const app = new Hono<SessionEnv>();

  /** RevenueCat, with the shared secret as the whole `Authorization` header. */
  app.post('/webhooks/revenuecat', async (c) => {
    const secret = c.env.REVENUECAT_WEBHOOK_AUTH;
    if (secret === undefined || secret === '') return fail(c, 503, 'unavailable');
    if (!sameText(c.req.header('Authorization') ?? '', secret)) return fail(c, 401, 'unauthorized');
    const parsed = RevenueCatWebhook.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return fail(
        c,
        400,
        'bad_request',
        parsed.error.issues.map((i) => i.path.join('.')).slice(0, 20),
      );
    }
    const outcome = await applyRevenueCatEvent(c.env.DB, parsed.data.event, Date.now());
    return c.json({ ok: true, outcome });
  });

  /** Stripe, for the printed scrapbook: the signature over the raw body first. */
  app.post('/webhooks/stripe', async (c) => {
    const secret = c.env.STRIPE_WEBHOOK_SECRET;
    if (secret === undefined || secret === '') return fail(c, 503, 'unavailable');
    const raw = await c.req.text();
    if (!(await verifyStripe(secret, c.req.header('Stripe-Signature'), raw, Date.now()))) {
      return fail(c, 401, 'unauthorized');
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return fail(c, 400, 'bad_request');
    }
    const parsed = StripeWebhook.safeParse(json);
    if (!parsed.success) return fail(c, 400, 'bad_request');
    await applyStripeEvent(c.env.DB, parsed.data, Date.now());
    return c.json({ received: true });
  });

  return app;
};
