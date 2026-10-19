import type { Lang } from '@kithfield/contracts';

/**
 * The language the Language row shows in the browser: the one the app reads in. A browser
 * follows its own languages until one is chosen here, while the account keeps its default
 * until then, so the account's would name a language the page isn't in.
 */
export function shownLanguage(_account: Lang | undefined, reading: Lang): Lang {
  return reading;
}
