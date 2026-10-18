import type { Money } from '@kithfield/contracts';
import type { Language } from '@kithfield/i18n';

const tag = (language: Language) => (language === 'vi' ? 'vi-VN' : 'en-GB');

/** Money in minor units, written the reader's way (`£6.80`, `£34`), whole amounts without pence. */
export function formatMoney(language: Language, money: Money): string {
  const base = new Intl.NumberFormat(tag(language), {
    style: 'currency',
    currency: money.currency,
  });
  const digits = base.resolvedOptions().maximumFractionDigits ?? 2;
  const unit = 10 ** digits;
  const whole = money.amount % unit === 0;
  const format = whole
    ? new Intl.NumberFormat(tag(language), {
        style: 'currency',
        currency: money.currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    : base;
  return format.format(money.amount / unit);
}

/** One share of an amount split between `ways` people, rounded up to the minor unit. */
export function shareOf(money: Money, ways: number): Money {
  return { amount: Math.ceil(money.amount / Math.max(1, ways)), currency: money.currency };
}
