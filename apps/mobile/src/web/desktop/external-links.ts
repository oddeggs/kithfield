import { openUrl } from '@tauri-apps/plugin-opener';

import { BASE_URL } from '../base-url';
import { outsideLink } from './outside-link';

const outside = (href: string) => outsideLink(href, window.location.href, BASE_URL);

/**
 * In the desktop app, links out of the app open in the system's browser: the window never opens
 * a second page of its own. Covers what the app opens (`window.open`, which the browser module
 * and `Linking` call) and links clicked in the page. The opener only takes http(s) addresses
 * (`apps/desktop/src-tauri/capabilities/links.json`).
 */
export function openLinksOutside(): void {
  const open = window.open.bind(window);
  window.open = (url?: string | URL, target?: string, features?: string) => {
    const away = url === undefined ? null : outside(String(url));
    if (away === null) return open(url, target, features);
    void openUrl(away);
    return null;
  };
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const href = link?.getAttribute('href');
      const away = href ? outside(href) : null;
      if (away === null) return;
      event.preventDefault();
      void openUrl(away);
    },
    true,
  );
}
