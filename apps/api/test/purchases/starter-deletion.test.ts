import type { ChipIn } from '@kithfield/contracts';
import { localDay } from '@kithfield/farm';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { type AccountDeletedJob, purgeAccount } from '../../src/auth/purge';
import { api, cast, plantFarm, type Person, useTestPorts } from '../farm/support/doubles';
import { boughtConsumable, entitlements } from './support';

beforeEach(() => {
  useTestPorts({ at: Date.now() });
});

const pledge = (person: Person, id: string, tier: string, transaction: string | null) =>
  api(person, 'POST', `/v1/chip-ins/${id}/pledges`, { tier, transaction });

describe('deleting the account of whoever started a chip-in', () => {
  it('closes it, keeps what was paid as the payers’ credit, and forgets who started it', async () => {
    const { pip, fig, bea, kit } = await cast('pip', 'fig', 'bea', 'kit');
    const { farm } = await plantFarm(pip, [fig, bea, kit]);
    await api(fig, 'PATCH', '/v1/me/profile', {
      birthday: localDay(Date.now(), 'Europe/London').slice(5),
    });
    const { chipIn } = (
      await api(pip, 'POST', `/v1/farms/${farm}/chip-ins`, {
        for: 'gift',
        to: fig.id,
        item: 'treehouse',
        wrap: 'clay',
      })
    ).body as ChipIn;
    await pledge(bea, chipIn, 'kf.chipin.300', null);
    await pledge(kit, chipIn, 'kf.chipin.200', null);
    await pledge(kit, chipIn, 'kf.chipin.200', await boughtConsumable(kit, 'kf.chipin.200'));

    // Asked for long ago, so the purge runs now.
    await env.DB.prepare('UPDATE people SET deleted_at = 0 WHERE id = ?').bind(pip.id).run();
    await purgeAccount(env, {
      kind: 'account_deleted',
      person: pip.id,
      at: 0,
    } satisfies AccountDeletedJob);

    const row = await env.DB.prepare('SELECT state, by_id FROM chip_ins WHERE id = ?')
      .bind(chipIn)
      .first<{ state: string; by_id: string }>();
    expect(row).toEqual({ state: 'closed', by_id: 'gone' });
    const pledges = (
      await env.DB.prepare(
        'SELECT person_id, state FROM pledges WHERE chip_in_id = ? ORDER BY person_id',
      )
        .bind(chipIn)
        .all<{ person_id: string; state: string }>()
    ).results;
    expect(pledges).toEqual(
      [
        { person_id: bea.id, state: 'released' },
        { person_id: kit.id, state: 'paid' },
      ].sort((a, b) => a.person_id.localeCompare(b.person_id)),
    );
    expect(
      await env.DB.prepare('SELECT 1 FROM chip_in_payments WHERE chip_in_id = ?')
        .bind(chipIn)
        .all(),
    ).toMatchObject({ results: [{ 1: 1 }] });
    expect((await entitlements(kit)).owned).toContain('treehouse');
  });
});
