import type { Lang } from '@kithfield/contracts';

/** The language the Language row shows: the account's, which the app follows once chosen. */
export function shownLanguage(account: Lang | undefined, reading: Lang): Lang {
  return account ?? reading;
}
