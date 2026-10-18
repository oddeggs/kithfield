import { PATRON_PRODUCTS, type Patronage, type StoreProductId } from '@kithfield/contracts';
import type { Language, Translate } from '@kithfield/i18n';

import { dayMonthYear } from './format';

/** A patronage in one line: "Patron · yearly · renews 14 Oct 2027". */
export function planLine(t: Translate, language: Language, p: Patronage): string {
  if (p.via === 'farm_plus') return t('shop.member.planCovered');
  const tier = t(`shop.tier.${p.tier}`);
  if (p.period === 'lifetime' || p.period === null) return t('shop.member.planLifetime', { tier });
  const period = t(`shop.period.${p.period}`);
  if (p.until === null) return t('shop.manage.planValue', { tier, period });
  const date = dayMonthYear(language, p.until);
  return p.state === 'ending'
    ? t('shop.member.planEnding', { tier, period, date })
    : t('shop.member.plan', { tier, period, date });
}

/** The plans a patronage can switch to, in the store's subscription group. */
export function switchesOf(
  p: Patronage,
): readonly { label: 'toPlus' | 'toPatron' | 'toMonthly' | 'toYearly'; product: StoreProductId }[] {
  if (p.via !== 'own' || p.tier === 'founding') return [];
  if (p.tier === 'farm_plus')
    return [{ label: 'toPatron', product: PATRON_PRODUCTS.patronMonthly }];
  return [
    { label: 'toPlus', product: PATRON_PRODUCTS.farmPlusMonthly },
    p.period === 'year'
      ? { label: 'toMonthly', product: PATRON_PRODUCTS.patronMonthly }
      : { label: 'toYearly', product: PATRON_PRODUCTS.patronYearly },
  ];
}

/** A vote option's name; a critter this app has no copy for yet is "a new critter". */
export function voteName(t: Translate, option: string): string {
  if (option === 'hare' || option === 'heron' || option === 'hedgepig')
    return t(`shop.vote.${option}`);
  return t('shop.vote.unknown');
}
