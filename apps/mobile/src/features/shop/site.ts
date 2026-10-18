import type { Language } from '@kithfield/i18n';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

/** The website pages the patron screens link to. */
export type ShopPage = 'costs' | 'terms' | 'privacy';

/** The website beside this app's API (`https://kithfield.com/api` → `https://kithfield.com`). */
function site(): string {
  const extra = Constants.expoConfig?.extra as { apiBase?: unknown } | undefined;
  const base = typeof extra?.apiBase === 'string' ? extra.apiBase : 'https://kithfield.com/api';
  return base.replace(/\/api\/?$/, '');
}

/** A website page in the reader's language: Vietnamese pages live under `/vi`. */
export function shopPageUrl(page: ShopPage, language: Language): string {
  return `${site()}${language === 'vi' ? '/vi' : ''}/${page}`;
}

/** Opens a website page in the in-app browser. */
export function openShopPage(page: ShopPage, language: Language): void {
  void WebBrowser.openBrowserAsync(shopPageUrl(page, language));
}
