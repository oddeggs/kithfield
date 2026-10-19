import type { ChipIn } from '@kithfield/contracts';
import { localDay } from '@kithfield/farm';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, cast, plantFarm, type Person } from '../farm/support/doubles';
import { boughtConsumable, entitlements, holdClock, rcEvent, tell } from './support';

/*
 * Nobody is charged until a chip-in is covered; then each pledger pays their own share. A valid
 * payment is never dropped: one that arrives too late, or twice, becomes the payer's own credit.
 * Only Apple refunds anything.
 */

beforeEach(() => {
  holdClock();
});

afterEach(() => {
  vi.useRealTimers();
});

const pledge = (person: Person, id: string, tier: string, transaction: string | null) =>
  api(person, 'POST', `/v1/chip-ins/${id}/pledges`, { tier, transaction });

const pay = async (person: Person, id: string, tier: string) =>
  pledge(person, id, tier, await boughtConsumable(person, tier));

const rows = async <T>(sql: string, ...binds: unknown[]) =>
  (
    await env.DB.prepare(sql)
      .bind(...binds)
      .all<T>()
  ).results;

/** Fig's birthday today, and a chip-in for her treehouse (499) started by Pip. */
const birthday = async () => {
  const { pip, fig, bea, kit } = await cast('pip', 'fig', 'bea', 'kit');
  const { farm, stub } = await plantFarm(pip, [fig, bea, kit]);
  const today = localDay(Date.now(), 'Europe/London');
  await api(fig, 'PATCH', '/v1/me/profile', { birthday: today.slice(5) });
  const started = await api(pip, 'POST', `/v1/farms/${farm}/chip-ins`, {
    for: 'gift',
    to: fig.id,
    item: 'treehouse',
    wrap: 'fern',
  });
  expect(started.status).toBe(200);
  return { pip, fig, bea, kit, farm, stub, chipIn: (started.body as ChipIn).chipIn };
};

const close = (chipIn: string) =>
  env.DB.prepare('UPDATE chip_ins SET closes_at = ? WHERE id = ?')
    .bind(Date.now() - 1, chipIn)
    .run();

describe('paying for a chip-in', () => {
  it('lets the last two payers race and completes it exactly once', async () => {
    const { pip, bea, fig, chipIn } = await birthday();
    await pledge(pip, chipIn, 'kf.chipin.300', null);
    expect(((await pledge(bea, chipIn, 'kf.chipin.200', null)).body as ChipIn).state).toBe(
      'covered',
    );
    const [a, b] = await Promise.all([
      boughtConsumable(pip, 'kf.chipin.300'),
      boughtConsumable(bea, 'kf.chipin.200'),
    ]);
    const answers = await Promise.all([
      pledge(pip, chipIn, 'kf.chipin.300', a),
      pledge(bea, chipIn, 'kf.chipin.200', b),
    ]);
    expect(answers.map((r) => r.status)).toEqual([200, 200]);
    expect(await rows('SELECT id FROM gifts WHERE chip_in_id = ?', chipIn)).toHaveLength(1);
    expect(
      await rows('SELECT transaction_id FROM chip_in_payments WHERE chip_in_id = ?', chipIn),
    ).toHaveLength(2);
    expect(
      (await rows<{ state: string }>('SELECT state FROM pledges WHERE chip_in_id = ?', chipIn)).map(
        (p) => p.state,
      ),
    ).toEqual(['paid', 'paid']);
    expect((await entitlements(fig)).owned).toContain('treehouse');
  });

  it('records a payment that arrives after the chip-in closed, as the payer’s own item', async () => {
    const { pip, bea, chipIn } = await birthday();
    await pledge(pip, chipIn, 'kf.chipin.300', null);
    await pledge(bea, chipIn, 'kf.chipin.200', null);
    await close(chipIn);
    const late = await pay(bea, chipIn, 'kf.chipin.200');
    expect(late.status).toBe(200);
    expect(await rows('SELECT 1 FROM chip_in_payments WHERE person_id = ?', bea.id)).toHaveLength(
      1,
    );
    expect((await entitlements(bea)).owned).toContain('treehouse');
    expect(await rows('SELECT value, item FROM shop_credits WHERE person_id = ?', bea.id)).toEqual([
      { value: 200, item: 'treehouse' },
    ]);
  });

  it('turns a second payment from the same person into their shop credit', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const { chipIn } = (
      await api(fig, 'POST', `/v1/farms/${farm}/chip-ins`, { for: 'theme', theme: 'mountain_lake' })
    ).body as ChipIn;
    await pay(fig, chipIn, 'kf.chipin.300');
    const again = await pay(fig, chipIn, 'kf.chipin.300');
    expect(again.status).toBe(200);
    expect(await rows('SELECT 1 FROM chip_in_payments WHERE chip_in_id = ?', chipIn)).toHaveLength(
      2,
    );
    expect(await rows('SELECT value, item FROM shop_credits WHERE person_id = ?', fig.id)).toEqual([
      { value: 300, item: null },
    ]);
  });

  it('closes uncovered by payments with each paid share the payer’s, and refunds nothing', async () => {
    const { pip, bea, farm, chipIn } = await birthday();
    await pledge(pip, chipIn, 'kf.chipin.300', null);
    await pledge(bea, chipIn, 'kf.chipin.200', null);
    await pay(pip, chipIn, 'kf.chipin.300');
    await close(chipIn);
    await api(pip, 'GET', `/v1/farms/${farm}/chip-ins`);
    const states = await rows<{ person_id: string; state: string; refund_owed: number }>(
      'SELECT person_id, state, refund_owed FROM pledges WHERE chip_in_id = ? ORDER BY state',
      chipIn,
    );
    expect(states).toEqual([
      { person_id: pip.id, state: 'paid', refund_owed: 0 },
      { person_id: bea.id, state: 'released', refund_owed: 0 },
    ]);
    expect((await entitlements(pip)).owned).toContain('treehouse');
  });

  it('leaves a theme open when its pay window passes, keeping what was paid', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const { chipIn } = (
      await api(fig, 'POST', `/v1/farms/${farm}/chip-ins`, { for: 'theme', theme: 'seaside_cove' })
    ).body as ChipIn;
    await pledge(fig, chipIn, 'kf.chipin.500', null);
    await pledge(pip, chipIn, 'kf.chipin.500', null);
    await pay(fig, chipIn, 'kf.chipin.500');
    await close(chipIn);
    const view = (await api(fig, 'GET', `/v1/farms/${farm}/chip-ins`)).body as {
      chipIns: ChipIn[];
    };
    const theme = view.chipIns.find((c) => c.chipIn === chipIn);
    expect(theme).toMatchObject({ state: 'open', closesAt: null, mine: { state: 'paid' } });
    expect(
      await rows<{ state: string }>('SELECT state FROM pledges WHERE person_id = ?', pip.id),
    ).toEqual([{ state: 'released' }]);
  });

  it('marks a share refunded only when Apple refunds it', async () => {
    const { pip, chipIn } = await birthday();
    const tx = await boughtConsumable(pip, 'kf.chipin.300');
    await pledge(pip, chipIn, 'kf.chipin.300', tx);
    await tell(
      rcEvent(pip.id, 'CANCELLATION', 'kf.chipin.300', {
        transaction_id: tx,
        cancel_reason: 'CUSTOMER_SUPPORT',
        expiration_at_ms: null,
      }),
    );
    expect(
      await rows('SELECT state, refund_owed FROM pledges WHERE chip_in_id = ?', chipIn),
    ).toEqual([{ state: 'refunded', refund_owed: 1 }]);
  });

  it('shows one pledger’s share only to the nearest eighth', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const { chipIn } = (
      await api(fig, 'POST', `/v1/farms/${farm}/chip-ins`, { for: 'theme', theme: 'cherry_valley' })
    ).body as ChipIn;
    const one = (await pledge(fig, chipIn, 'kf.chipin.300', null)).body as ChipIn;
    expect(one.filled * 8).toBe(Math.round(one.filled * 8));
    expect(one.filled).toBe(2 / 8);
    const two = (await pledge(pip, chipIn, 'kf.chipin.200', null)).body as ChipIn;
    expect(two.filled).toBeCloseTo(500 / 999);
  });
});
