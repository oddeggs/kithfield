/**
 * Starts the art renderer (`design/kithfield-art.js`, synced unchanged into `@kithfield/art`).
 *
 * Its first drawing of a large scene is one long task, so it starts once the page has loaded and
 * the browser is idle (at most two seconds later), or sooner when a mouse moves or a key is
 * pressed. Until then the hero shows a softened still of the same scene. Every `<kf-art>` box is
 * sized in CSS beforehand, so nothing moves when it draws. The renderer honours
 * `prefers-reduced-motion` itself (still frames) and only draws art near the viewport.
 */
const IDLE_TIMEOUT_MS = 2000;
const NUDGES = ['pointermove', 'keydown'] as const;

export function startArt(): void {
  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    for (const name of NUDGES) removeEventListener(name, start, true);
    void import('@kithfield/art/kithfield-art.js');
  };
  for (const name of NUDGES) addEventListener(name, start, { capture: true, passive: true });
  const afterLoad = (): void => {
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });
    else setTimeout(start, 0);
  };
  if (document.readyState === 'complete') afterLoad();
  else addEventListener('load', afterLoad, { once: true });
}
