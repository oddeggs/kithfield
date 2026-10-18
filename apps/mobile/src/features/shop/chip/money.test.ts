import { describe, expect, it } from '@jest/globals';

import { formatMoney, shareOf } from './money';

describe('the printed book’s price', () => {
  it('splits a price between friends, rounding each share up', () => {
    expect(shareOf({ amount: 3400, currency: 'GBP' }, 5)).toEqual({ amount: 680, currency: 'GBP' });
    expect(shareOf({ amount: 1000, currency: 'GBP' }, 3)).toEqual({ amount: 334, currency: 'GBP' });
    expect(shareOf({ amount: 1000, currency: 'GBP' }, 0).amount).toBe(1000);
  });

  it('writes minor units as the currency does', () => {
    expect(formatMoney('en', { amount: 680, currency: 'GBP' })).toBe('£6.80');
    expect(formatMoney('en', { amount: 3400, currency: 'GBP' })).toBe('£34');
  });
});
