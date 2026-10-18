/**
 * Starts the art renderer (`design/kithfield-art.js`, synced unchanged into `@kithfield/art`) once
 * the page has painted, so the headline is the first thing on screen and the canvases fill in
 * behind it. Every `<kf-art>` box is sized in CSS beforehand, so nothing moves when it draws. The
 * renderer honours `prefers-reduced-motion` itself (still frames) and only draws art near view.
 */
export function startArt(): void {
  const load = (): void => {
    void import('@kithfield/art/kithfield-art.js');
  };
  const afterPaint = (): void => {
    requestAnimationFrame(() => setTimeout(load, 0));
  };
  if (document.readyState === 'complete') afterPaint();
  else addEventListener('load', afterPaint, { once: true });
}
