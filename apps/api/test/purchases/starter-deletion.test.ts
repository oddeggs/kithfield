import type { ChipIn } from '@kithfield/contracts';
import { localDay } from '@kithfield/farm';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type AccountDeletedJob, purgeAccount } from '../../src/auth/purge';
import { api, cast, plantFarm, type Person, useTestPorts } from '../farm/support/doubles';
import { boughtConsumable, entitlements } from './support';

/*
 * The clock is fixed: a chip-in is for the friend's birthday in the farm's time zone, so a test
 * on the wall clock fails whenever London's midnight falls inside it.
 */

/** Sets the wall clock (the Worker's and the farm's) to `iso`, and holds it there. */
const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
  useTestPorts({ at: Date.now() });
};

afterEach(() => {
  vi.useRealTimers();
});

const pledge = (person: Person, id: string, tier: string, transaction: string | null) =>
  api(person, 'POST', `/v1/chip-ins/${id}/pledges`, { tier, transaction });

/** By code unit, as SQLite orders text. */
const byPerson = (a: { person_id: string }, b: { person_id: string }) =>
  a.person_id < b.person_id ? -1 : a.person_id > b.person_id ? 1 : 0;

describe('deleting the account of whoever started a chip-in', () => {
  it.each([
    ['in the afternoon of the birthday', '2026-10-18T14:00:00Z', null],
    ['in the last second of the birthday', '2026-10-18T22:59:59.500Z', null],
    ['once the birthday is over', '2026-10-18T22:59:30Z', '2026-10-18T23:00:30Z'],
  ])(
    '%s: closes it, keeps what was paid as the payers’ credit, and forgets who started it',
    async (_when, started, purged) => {
      at(started);
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
      expect((await pledge(bea, chipIn, 'kf.chipin.300', null)).status).toBe(200);
      expect((await pledge(kit, chipIn, 'kf.chipin.200', null)).status).toBe(200);
      const paid = await boughtConsumable(kit, 'kf.chipin.200');
      expect((await pledge(kit, chipIn, 'kf.chipin.200', paid)).status).toBe(200);

      if (purged !== null) vi.setSystemTime(new Date(purged));
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
        await env.DB.prepare('SELECT person_id, state FROM pledges WHERE chip_in_id = ?')
          .bind(chipIn)
          .all<{ person_id: string; state: string }>()
      ).results;
      expect(pledges.sort(byPerson)).toEqual(
        [
          { person_id: bea.id, state: 'released' },
          { person_id: kit.id, state: 'paid' },
        ].sort(byPerson),
      );
      expect(
        await env.DB.prepare('SELECT 1 FROM chip_in_payments WHERE chip_in_id = ?')
          .bind(chipIn)
          .all(),
      ).toMatchObject({ results: [{ 1: 1 }] });
      expect((await entitlements(kit)).owned).toContain('treehouse');
    },
  );
});
