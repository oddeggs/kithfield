import { describe, expect, it } from '@jest/globals';
import type { Entitlements, Patronage } from '@kithfield/contracts';

import { patronRoute } from './patron-route';

const patronage = (state: Patronage['state']): Patronage => ({
  tier: 'patron',
  via: 'own',
  period: 'year',
  state,
  since: 1_760_000_000_000,
  until: state === 'lapsed' ? null : 1_790_000_000_000,
  store: 'app_store',
});

const ents = (perks: boolean, p: Patronage | null): Entitlements => ({
  perks,
  patronage: p,
  farmPlus: null,
  owned: [],
  wallName: null,
});

describe('where patrons leads', () => {
  it('takes a patron with perks to their own view, ending or in grace too', () => {
    expect(patronRoute(ents(true, patronage('active')))).toBe('/shop/patron');
    expect(patronRoute(ents(true, patronage('ending')))).toBe('/shop/patron');
    expect(patronRoute(ents(true, patronage('grace')))).toBe('/shop/patron');
  });

  it('takes someone whose patronage lapsed to what they kept', () => {
    expect(patronRoute(ents(false, patronage('lapsed')))).toBe('/shop/lapsed');
  });

  it('shows everyone else the honest pitch', () => {
    expect(patronRoute(ents(false, null))).toBe('/shop/patrons');
    expect(patronRoute(null)).toBe('/shop/patrons');
  });
});
