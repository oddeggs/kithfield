/**
 * Starts the art renderer (`design/kithfield-art.js`, synced unchanged into `@kithfield/art`).
 *
 * Its first drawing of a large scene is one long task, so it waits until the visitor does
 * something (moves, scrolls, taps, types) or the page has been settled for a few seconds; until
 * then the hero shows a softened still of the same scene. Every `<kf-art>` box is sized in CSS
 * beforehand, so nothing moves when it draws. The renderer honours `prefers-reduced-motion`
 * itself (still frames) and only draws art near the viewport.
 */
const SETTLED_MS = 3500;
const NUDGES = ['pointermove', 'pointerdown', 'wheel', 'scroll', 'keydown', 'touchstart'] as const;

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
    setTimeout(start, SETTLED_MS);
  };
  if (document.readyState === 'complete') afterLoad();
  else addEventListener('load', afterLoad, { once: true });
}
