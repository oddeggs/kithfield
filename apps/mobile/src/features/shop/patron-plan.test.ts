import { describe, expect, it } from '@jest/globals';
import { PATRON_PRODUCTS, type Patronage } from '@kithfield/contracts';
import { translator } from '@kithfield/i18n';

import { planLine, switchesOf } from './patron-plan';

const t = translator('en');
const until = Date.UTC(2027, 9, 14, 12);
const base: Patronage = {
  tier: 'patron',
  via: 'own',
  period: 'year',
  state: 'active',
  since: Date.UTC(2026, 9, 14),
  until,
  store: 'app_store',
};

describe('a patronage in one line', () => {
  it('names the tier, the period and when it renews or ends', () => {
    expect(planLine(t, 'en', base)).toBe('Patron · yearly · renews 14 Oct 2027');
    expect(planLine(t, 'en', { ...base, state: 'ending' })).toBe(
      'Patron · yearly · perks until 14 Oct 2027',
    );
  });

  it('says a lifetime and a friend’s Farm Plus plainly', () => {
    expect(planLine(t, 'en', { ...base, tier: 'founding', period: 'lifetime', until: null })).toBe(
      'Founding Farmer · for life',
    );
    expect(planLine(t, 'en', { ...base, tier: 'farm_plus', via: 'farm_plus' })).toBe(
      'Farm Plus · from a friend',
    );
  });
});

describe('switching plans', () => {
  it('offers Farm Plus and the other period to a patron', () => {
    expect(switchesOf(base).map((s) => s.product)).toEqual([
      PATRON_PRODUCTS.farmPlusMonthly,
      PATRON_PRODUCTS.patronMonthly,
    ]);
  });

  it('offers nothing to a founding farmer or someone covered by a friend', () => {
    expect(switchesOf({ ...base, tier: 'founding', period: 'lifetime' })).toEqual([]);
    expect(switchesOf({ ...base, tier: 'farm_plus', via: 'farm_plus' })).toEqual([]);
  });
});
