import type { StripeWebhook } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { applyStripeEvent } from '../../src/purchases/stripe';
import { cast } from '../farm/support/doubles';

let n = 0;
const event = (type: string, order: string, person: string, id?: string): StripeWebhook => ({
  id: id ?? `evt_${Date.now()}x${(n += 1)}`,
  type,
  livemode: false,
  created: 1,
  data: { object: { id: 'pi_1', object: 'payment_intent', metadata: { order, person } } },
});

const shareState = async (order: string) =>
  (
    await env.DB.prepare('SELECT state FROM book_shares WHERE order_id = ?')
      .bind(order)
      .first<{ state: string }>()
  )?.state;

/** An open book order with Pip's share waiting. */
const order = async () => {
  const { pip } = await cast('pip');
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO book_orders (id, farm_id, year, cloth, by_id, state, split, created_at)
       VALUES (?, 'farm-x', 2026, 'moss', ?, 'open', 1, 0)`,
    ).bind(id, pip.id),
    env.DB.prepare(
      `INSERT INTO book_shares (order_id, person_id, state, at) VALUES (?, ?, 'pending', 0)`,
    ).bind(id, pip.id),
  ]);
  return { id, pip };
};

describe('Stripe’s news of a book share', () => {
  it('applies each event once', async () => {
    const { id, pip } = await order();
    const paid = event('payment_intent.succeeded', id, pip.id);
    expect(await applyStripeEvent(env.DB, paid, Date.now())).toBe(true);
    expect(await applyStripeEvent(env.DB, event('charge.refunded', id, pip.id), Date.now())).toBe(
      true,
    );
    // The paid event delivered again changes nothing.
    expect(await applyStripeEvent(env.DB, paid, Date.now())).toBe(false);
    expect(await shareState(id)).toBe('refunded');
  });

  it('never moves a share back to an earlier state when news arrives out of order', async () => {
    const { id, pip } = await order();
    await applyStripeEvent(env.DB, event('payment_intent.succeeded', id, pip.id), Date.now());
    expect(
      await applyStripeEvent(
        env.DB,
        event('payment_intent.amount_capturable_updated', id, pip.id),
        Date.now(),
      ),
    ).toBe(false);
    await applyStripeEvent(env.DB, event('payment_intent.canceled', id, pip.id), Date.now());
    expect(await shareState(id)).toBe('paid');
  });
});
