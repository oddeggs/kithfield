/**
 * Functions that run inside the design page (passed to `evaluate`), so each one is self-contained:
 * no imports, no closures over Node values.
 */

/** The parts of the art element (`<kf-art>` from kithfield-art.js) the renderer drives. */
interface ArtElement extends HTMLElement {
  draw?: (t: number) => void;
  bgc: unknown;
  dirty: boolean;
  p?: number;
}

interface DesignWindow {
  __dcRootName?: () => string;
  __dcSetProps?: (name: string, props: Record<string, unknown>) => void;
  KF?: unknown;
  /** Set only while the renderer draws; the art's own frame loop draws nothing. */
  __kfRendererDrawing?: boolean;
}

/**
 * Init script: lets the art element draw only when the renderer asks. The art engine caches
 * sprites on first draw, so whichever element draws first shapes the cache; left to its own
 * frame loop, that order follows what happened to be on screen. The renderer draws in document
 * order every time instead.
 */
export function gateArtDraws(): void {
  const define = customElements.define.bind(customElements);
  customElements.define = function (name, constructor, options) {
    const proto = constructor.prototype as { draw?: (t: number) => void };
    const draw = proto.draw;
    if (name === 'kf-art' && typeof draw === 'function') {
      proto.draw = function (this: unknown, t: number) {
        if ((window as unknown as DesignWindow).__kfRendererDrawing) draw.call(this, t);
      };
    }
    define(name, constructor, options);
  };
}

/** True once the design runtime has booted, its template rendered and the art element exists. */
export function designBooted(): boolean {
  const w = window as unknown as DesignWindow;
  const root = document.getElementById('dc-root');
  return (
    document.readyState === 'complete' &&
    typeof w.__dcRootName === 'function' &&
    !!root &&
    root.childElementCount > 0 &&
    !!customElements.get('kf-art') &&
    !!w.KF &&
    !document.querySelector('.sc-placeholder, .sc-missing')
  );
}

/** Loads every declared font face (all unicode ranges, so canvas text never falls back). */
export async function loadAllFonts(): Promise<number> {
  const faces = [...document.fonts];
  await Promise.all(faces.map((face) => face.load().catch(() => null)));
  await document.fonts.ready;
  return faces.filter((face) => face.status !== 'loaded').length;
}

/** Lets queued React work (scheduled on a MessageChannel, not on timers) run to completion. */
export function flushTasks(rounds: number): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let n = 0;
    channel.port1.onmessage = () => {
      if (++n >= rounds) {
        channel.port1.close();
        resolve();
      } else channel.port2.postMessage(0);
    };
    channel.port2.postMessage(0);
  });
}

/** Applies a set of tweak props through the design runtime. */
export function setTweaks(props: Record<string, unknown>): void {
  const w = window as unknown as DesignWindow;
  const name = w.__dcRootName?.();
  if (name && w.__dcSetProps) w.__dcSetProps(name, props);
}

/**
 * Redraws every art element at one fixed instant: `t` seconds for animated art, or the art's own
 * still time when it holds still. Returns how many visible art elements are still blank.
 */
export function drawArtAt(args: { t: number; stillT: number; motion: boolean }): number {
  const w = window as unknown as DesignWindow;
  w.__kfRendererDrawing = true;
  let blank = 0;
  for (const el of document.querySelectorAll<ArtElement>('kf-art')) {
    if (typeof el.draw !== 'function') continue;
    const still = el.hasAttribute('still') || !args.motion;
    el.bgc = null;
    el.draw(still ? args.stillT : args.t);
    const canvas = el.querySelector('canvas');
    const sized = el.clientWidth > 0 && el.clientHeight > 0 && !!el.getAttribute('scene');
    if (sized && (!canvas || canvas.width === 0 || el.dirty)) blank++;
  }
  w.__kfRendererDrawing = false;
  return blank;
}

/**
 * Holds every script-made animation (Web Animations, such as the live motion samples) at its
 * first frame. A zero playback rate also keeps the screenshot step from fast-forwarding it, which
 * it does to CSS animations and transitions (those finish, as they would on screen).
 */
export function holdScriptAnimations(): number {
  let held = 0;
  for (const animation of document.getAnimations()) {
    if (animation instanceof CSSAnimation || animation instanceof CSSTransition) continue;
    animation.pause();
    animation.currentTime = 0;
    animation.playbackRate = 0;
    // A `will-change: transform` layer keeps the raster scale it had mid-flight; dropping the hint
    // re-rasterises it at the held frame's scale, whatever the animation did before.
    const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
    if (target instanceof HTMLElement) target.style.willChange = 'auto';
    held++;
  }
  return held;
}

/** The scrollable height of the document. */
export function documentHeight(): number {
  return document.documentElement.scrollHeight;
}

export interface TargetInfo {
  index: number;
  label: string;
  width: number;
  height: number;
  /** Whether it reaches past the viewport's right edge. */
  overflows: boolean;
}

/** Tags each `[data-screen-label]` frame with `data-render-target` and reports its label and size. */
export function tagScreens(): TargetInfo[] {
  return [...document.querySelectorAll<HTMLElement>('[data-screen-label]')].map((el, index) => {
    el.setAttribute('data-render-target', String(index));
    return {
      index,
      label: el.getAttribute('data-screen-label') ?? '',
      width: el.offsetWidth,
      height: el.offsetHeight,
      overflows: el.getBoundingClientRect().right + scrollX > document.documentElement.clientWidth,
    };
  });
}

/**
 * Tags the sections of a canvas file: the blocks under `<main>` after the file's own header,
 * leaving out footnotes (blocks under 80 px, or only paragraphs). The label is the section's id,
 * or its title (the first line of text) when it has none.
 */
export function tagSections(): TargetInfo[] {
  const main = document.querySelector('main');
  if (!main) return [];
  const blocks = [...main.children]
    .filter((el): el is HTMLElement => el instanceof HTMLElement && el.offsetHeight > 0)
    .slice(1)
    .filter(
      (el) =>
        el.offsetHeight >= 80 &&
        el.tagName !== 'P' &&
        !(el.children.length > 0 && [...el.children].every((child) => child.tagName === 'P')),
    );
  return blocks.map((el, index) => {
    el.setAttribute('data-render-target', String(index));
    const title = (el.innerText.split('\n').find((line) => line.trim()) ?? '').trim();
    return {
      index,
      label: el.id || title,
      width: el.offsetWidth,
      height: el.offsetHeight,
      overflows: el.getBoundingClientRect().right + scrollX > document.documentElement.clientWidth,
    };
  });
}

export interface PageSection {
  label: string;
  top: number;
  height: number;
}

/**
 * The top-level `<section>` blocks of a scrolling page, with their document offsets, and the
 * height of the bar pinned across the top of the viewport (a fixed or sticky nav), if any.
 */
export function pageSections(): { sections: PageSection[]; pageHeight: number; topInset: number } {
  let topInset = 0;
  for (const el of document.querySelectorAll<HTMLElement>('body *')) {
    const position = getComputedStyle(el).position;
    if (position !== 'fixed' && position !== 'sticky') continue;
    const box = el.getBoundingClientRect();
    const bar = box.top <= 0 && box.width >= innerWidth * 0.9 && box.height < innerHeight / 3;
    if (bar) topInset = Math.max(topInset, Math.round(box.bottom));
  }
  const sections = [...document.querySelectorAll<HTMLElement>('section')]
    .filter((el) => !el.parentElement?.closest('section'))
    .map((el) => {
      const box = el.getBoundingClientRect();
      const title = (el.innerText.split('\n').find((line) => line.trim()) ?? '').trim();
      return { label: el.id || title, top: box.top + scrollY, height: box.height };
    });
  return { sections, pageHeight: document.documentElement.scrollHeight, topInset };
}

/**
 * Scrolls a tagged target to the top-left of the viewport and returns its capture box: the
 * rounded origin and the layout size. Content at fractional offsets rasterises differently at
 * different scroll offsets, so each capture starts from the same one instead of wherever the
 * previous capture left the page.
 */
export function bringToTop(index: number): { x: number; y: number; width: number; height: number } {
  const el = document.querySelector<HTMLElement>(`[data-render-target="${index}"]`);
  if (!el) throw new Error(`No render target ${index}`);
  el.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' });
  const box = el.getBoundingClientRect();
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

/** Jumps (no smooth scrolling) to a vertical offset. */
export function jumpTo(y: number): number {
  window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  return scrollY;
}
