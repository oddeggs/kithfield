/**
 * Where a link goes when it leaves the app: an http(s) address that isn't one of the app's own
 * pages (`base`, the path the app is served under), or null for what stays in the window (the
 * app's routes) and for what the system's browser is never handed (files, `blob:` and `data:`
 * documents, `mailto:` and every other scheme).
 */
export function outsideLink(href: string, page: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(href, page);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const ours =
    url.origin === new URL(page).origin &&
    (base === '' || url.pathname === base || url.pathname.startsWith(`${base}/`));
  return ours ? null : url.href;
}
