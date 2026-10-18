import type { Language } from '@kithfield/i18n';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

/** Where people write to the safety team, published in the app and on the website. */
export const SAFETY_EMAIL = 'safety@kithfield.com';

/** Apple Weather's legal attribution, shown wherever farm weather appears. */
export const WEATHER_SOURCES_URL = 'https://weatherkit.apple.com/legal-attribution.html';

export type SitePage = 'terms' | 'privacy' | 'support' | 'contact' | 'acknowledgements';

/** The website beside this app's API (`https://kithfield.com/api` → `https://kithfield.com`). */
export function siteUrl(page: SitePage, language: Language): string {
  const { apiBase } = Constants.expoConfig?.extra as { apiBase: string };
  const site = apiBase.replace(/\/api\/?$/, '');
  return `${site}${language === 'vi' ? '/vi' : ''}/${page}`;
}

/** Opens a page in the in-app browser. */
export function openPage(url: string): void {
  void WebBrowser.openBrowserAsync(url);
}
