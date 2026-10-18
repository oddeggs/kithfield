import type { Entitlements } from '@kithfield/contracts';

/** Where "patrons" leads: the patron's own view, the lapse screen, or the honest pitch. */
export type PatronRoute = '/shop/patron' | '/shop/lapsed' | '/shop/patrons';

export function patronRoute(entitlements: Entitlements | null): PatronRoute {
  if (entitlements?.perks === true) return '/shop/patron';
  if (entitlements?.patronage?.state === 'lapsed') return '/shop/lapsed';
  return '/shop/patrons';
}
