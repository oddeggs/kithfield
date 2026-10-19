/**
 * Functions that run inside a design page (passed to `evaluate`), so each one is self-contained:
 * no imports and no closures over Node values.
 */

/** The parts of the art element (`<kf-art>` from kithfield-art.js) this tool drives. */
interface ArtElement extends HTMLElement {
  draw?: (t: number) => void;
  bgc: unknown;
}

/** Undoes for every change made to a lifted box, run backwards when it is put back. */
interface UndoWindow {
  __launchUndo?: (() => void)[];
}

/** Marks the boxes of one frame that hold an asset, and reports their CSS sizes. */
export interface BoxInfo {
  index: number;
  width: number;
  height: number;
  /** The box's offset in its frame, in CSS pixels, to find it again in the frame's render. */
  x: number;
  y: number;
  /** The art scenes inside the box. */
  scenes: string[];
  /** The caption under or beside the box in the board, if any. */
  caption: string;
}

/**
 * Lists the asset boxes in the frame labelled `label` (a prefix match on `data-screen-label`): the
 * clipped, fixed-size, positioned boxes the board shows each export in. Tags each with
 * `data-launch-box`.
 */
export function listBoxes(label: string): BoxInfo[] {
  const frame = [...document.querySelectorAll<HTMLElement>('[data-screen-label]')].find((el) =>
    (el.getAttribute('data-screen-label') ?? '').startsWith(label),
  );
  if (!frame) throw new Error(`No frame ${label}`);
  const boxes = [...frame.querySelectorAll<HTMLElement>('div')].filter((el) => {
    const style = el.style;
    return (
      style.position === 'relative' &&
      style.overflow === 'hidden' &&
      style.width.endsWith('px') &&
      style.height.endsWith('px') &&
      el.offsetWidth >= 40
    );
  });
  const origin = frame.getBoundingClientRect();
  return boxes.map((el, index) => {
    el.setAttribute('data-launch-box', `${label}:${index}`);
    const box = el.getBoundingClientRect();
    const scenes = [...el.querySelectorAll('kf-art')]
      .map((art) => art.getAttribute('scene') ?? '')
      .filter((scene, i, all) => scene && all.indexOf(scene) === i);
    const next = el.nextElementSibling;
    const caption = next instanceof HTMLElement ? next.innerText.trim() : '';
    return {
      index,
      width: el.offsetWidth,
      height: el.offsetHeight,
      x: box.left - origin.left,
      y: box.top - origin.top,
      scenes,
      caption,
    };
  });
}

export interface IsolateArgs {
  selector: string;
  /** Device pixels per CSS pixel of the capture, so the art inside is drawn sharp at it. */
  deviceScale: number;
  /** Keep the board's rounded corners and shadow (a thumbnail); otherwise square and flat. */
  keepFrame?: boolean;
}

/**
 * Lifts one box out of the board: fixed at the viewport's top-left, square-cornered and without
 * its shadow, so a viewport the box's size captures exactly the asset. Every art element inside
 * is told to draw at the capture's pixel density. Returns the box's CSS size.
 */
export function isolate(args: IsolateArgs): { width: number; height: number } {
  const el = document.querySelector<HTMLElement>(args.selector);
  if (!el) throw new Error(`Nothing at ${args.selector}`);
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  el.setAttribute('data-launch-isolated', el.style.cssText);
  Object.assign(el.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    margin: '0px',
    zIndex: '2147483647',
    width: `${width}px`,
    height: `${height}px`,
    flex: 'none',
  });
  if (!args.keepFrame) Object.assign(el.style, { borderRadius: '0px', boxShadow: 'none' });
  // The dashed lines where a panorama is sliced are the board's guides, not part of the art.
  for (const guide of el.querySelectorAll<HTMLElement>('div')) {
    const s = guide.style;
    if (s.borderLeftStyle === 'dashed' && s.top === '0px' && s.bottom === '0px') {
      const css = s.cssText;
      ((window as unknown as UndoWindow).__launchUndo ??= []).push(() => {
        guide.style.cssText = css;
      });
      s.display = 'none';
    }
  }
  for (const art of el.querySelectorAll<ArtElement>('kf-art')) {
    // The scale the art is drawn at on screen: the product of its ancestors' transform scales.
    let scale = 1;
    for (let node: Element | null = art; node; node = node.parentElement) {
      const transform = getComputedStyle(node).transform;
      if (!transform || transform === 'none') continue;
      const m = new DOMMatrixReadOnly(transform);
      scale *= Math.hypot(m.a, m.b);
    }
    const dpr = Math.min(16, Math.max(1, args.deviceScale * scale));
    art.setAttribute('dpr', String(Math.round(dpr * 100) / 100));
    art.bgc = null;
  }
  return { width, height };
}

/** Puts every isolated box back where the board had it. */
export function restore(): void {
  const w = window as unknown as UndoWindow;
  for (const undo of (w.__launchUndo ?? []).reverse()) undo();
  w.__launchUndo = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-launch-isolated]')) {
    el.style.cssText = el.getAttribute('data-launch-isolated') ?? '';
    el.removeAttribute('data-launch-isolated');
  }
}

/**
 * Draws the art inside the isolated box at `t` seconds (still art at its own still time), and
 * moves every animation inside it (CSS or scripted) to the same instant, so a sequence of calls
 * steps through the box's motion frame by frame.
 */
export function drawIsolatedAt(args: { t: number; stillT: number; animate: boolean }): number {
  const root = document.querySelector<HTMLElement>('[data-launch-isolated]');
  if (!root) throw new Error('Nothing isolated');
  const w = window as unknown as { __kfRendererDrawing?: boolean };
  w.__kfRendererDrawing = true;
  let blank = 0;
  for (const art of root.querySelectorAll<ArtElement>('kf-art')) {
    if (typeof art.draw !== 'function') continue;
    const still = art.hasAttribute('still');
    art.draw(still ? args.stillT : args.t);
    const canvas = art.querySelector('canvas');
    if (art.clientWidth > 0 && (!canvas || canvas.width === 0)) blank++;
  }
  w.__kfRendererDrawing = false;
  if (args.animate) {
    for (const animation of root.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = args.t * 1000;
    }
  }
  return blank;
}

/** Sets attributes on the art elements matching `selector` inside the isolated box. */
export function setArtAttributes(args: {
  selector: string;
  attrs: Record<string, string | null>;
}): number {
  const root = document.querySelector<HTMLElement>('[data-launch-isolated]');
  if (!root) throw new Error('Nothing isolated');
  const arts = [...root.querySelectorAll<ArtElement>(args.selector)];
  const undo = ((window as unknown as UndoWindow).__launchUndo ??= []);
  for (const art of arts) {
    const before = Object.keys(args.attrs).map((name) => [name, art.getAttribute(name)] as const);
    undo.push(() => {
      for (const [name, value] of before) {
        if (value === null) art.removeAttribute(name);
        else art.setAttribute(name, value);
      }
      art.bgc = null;
    });
    for (const [name, value] of Object.entries(args.attrs)) {
      if (value === null) art.removeAttribute(name);
      else art.setAttribute(name, value);
    }
    art.bgc = null;
  }
  return arts.length;
}

/** How one piece of English board copy reads in Vietnamese, and the type it's set in. */
export interface Rewrite {
  texts: string[];
  /** The type the new copy is set in; without it, the element's own (after `swaps`). */
  font?: {
    family: string;
    weight: string;
    /** New size over old size, so a rewrite keeps the scale of the board it lands on. */
    sizeRatio: number;
    /** Line height over font size, when the new copy sets its own. */
    lineRatio: number | null;
  };
}

/** A typeface swapped for another wherever a rewrite brings no type of its own. */
export interface FontSwap {
  /** Matched against the element's computed font family. */
  from: string;
  family: string;
  weight: string;
  /** New size over old, as the board's own Vietnamese set sizes it. */
  sizeRatio: number;
}

export interface RewriteArgs {
  rewrites: Record<string, Rewrite>;
  swaps: FontSwap[];
}

/**
 * Builds the board's own English → Vietnamese rewrites by walking two frames that differ only in
 * language (element for element, in document order): every element whose text differs gives one
 * rewrite, keyed by its English text.
 */
export function rewritesBetween(args: { en: string; vi: string }): Record<string, Rewrite> {
  const frames = [...document.querySelectorAll<HTMLElement>('[data-screen-label]')];
  const enFrame = frames.find((f) =>
    (f.getAttribute('data-screen-label') ?? '').startsWith(args.en),
  );
  const viFrame = frames.find((f) =>
    (f.getAttribute('data-screen-label') ?? '').startsWith(args.vi),
  );
  if (!enFrame || !viFrame) throw new Error(`No frames ${args.en} and ${args.vi}`);
  const en = [...enFrame.querySelectorAll('*')];
  const vi = [...viFrame.querySelectorAll('*')];
  const out: Record<string, Rewrite> = {};
  for (let i = 0; i < Math.min(en.length, vi.length); i++) {
    const a = en[i];
    const b = vi[i];
    if (!a || !b || a.tagName !== b.tagName) break;
    // Each element's own text: its direct, non-blank text nodes, in order.
    const at = [...a.childNodes].filter(
      (node): node is Text => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim(),
    );
    const bt = [...b.childNodes].filter(
      (node): node is Text => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim(),
    );
    if (at.length === 0 || at.length !== bt.length) continue;
    const key = at.map((t) => (t.textContent ?? '').replace(/\s+/g, ' ').trim()).join('\n');
    const texts = bt.map((t) => (t.textContent ?? '').replace(/\s+/g, ' ').trim());
    if (key === texts.join('\n')) continue;
    const as = getComputedStyle(a);
    const bs = getComputedStyle(b);
    const aSize = parseFloat(as.fontSize);
    const bSize = parseFloat(bs.fontSize);
    const bLine = parseFloat(bs.lineHeight);
    const aLine = parseFloat(as.lineHeight);
    out[key] = {
      texts,
      font: {
        family: bs.fontFamily,
        weight: bs.fontWeight,
        sizeRatio: aSize > 0 ? bSize / aSize : 1,
        lineRatio:
          Number.isFinite(bLine) && Number.isFinite(aLine) && aLine !== bLine
            ? bLine / bSize
            : null,
      },
    };
  }
  return out;
}

/**
 * Rewrites the isolated box's copy with `rewrites` (keyed by the board's text), keeping each
 * element's colour, which follows day and night rather than language. Returns the copy it found no
 * rewrite for, so a caller can tell what still reads in the board's language.
 */
export function rewriteIsolated(args: RewriteArgs): string[] {
  const root = document.querySelector<HTMLElement>('[data-launch-isolated]');
  if (!root) throw new Error('Nothing isolated');
  const missing: string[] = [];
  for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    const texts = [...el.childNodes].filter(
      (node): node is Text => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim(),
    );
    if (texts.length === 0) continue;
    const key = texts.map((t) => (t.textContent ?? '').replace(/\s+/g, ' ').trim()).join('\n');
    const rewrite = args.rewrites[key];
    if (!rewrite) {
      if (/[A-Za-z]{2}/.test(key) && !/^\d/.test(key)) missing.push(key);
      continue;
    }
    const style = getComputedStyle(el);
    const size = parseFloat(style.fontSize);
    const undo = ((window as unknown as UndoWindow).__launchUndo ??= []);
    const css = el.style.cssText;
    undo.push(() => {
      el.style.cssText = css;
    });
    texts.forEach((t, i) => {
      const before = t.textContent;
      undo.push(() => {
        t.textContent = before;
      });
      t.textContent = rewrite.texts[i] ?? '';
    });
    if (rewrite.font) {
      el.style.fontFamily = rewrite.font.family;
      el.style.fontWeight = rewrite.font.weight;
      const next = size * rewrite.font.sizeRatio;
      el.style.fontSize = `${next}px`;
      if (rewrite.font.lineRatio !== null)
        el.style.lineHeight = `${next * rewrite.font.lineRatio}px`;
    } else {
      const swap = args.swaps.find((s) => style.fontFamily.includes(s.from));
      if (swap) {
        el.style.fontFamily = swap.family;
        el.style.fontWeight = swap.weight;
        el.style.fontSize = `${size * swap.sizeRatio}px`;
      }
    }
  }
  return missing;
}

/** Tags a whole frame (a phone screen) as a box, `<label>:frame`, and returns its size. */
export function tagFrame(label: string): { width: number; height: number } {
  const frame = [...document.querySelectorAll<HTMLElement>('[data-screen-label]')].find((el) =>
    (el.getAttribute('data-screen-label') ?? '').startsWith(label),
  );
  if (!frame) throw new Error(`No frame ${label}`);
  frame.setAttribute('data-launch-box', `${label}:frame`);
  return { width: frame.offsetWidth, height: frame.offsetHeight };
}

export interface Edits {
  /** Copy to replace, by an element's exact own text. */
  texts?: { from: string; to: string }[];
  /** Art to redraw as another scene: the `nth` art element in the box, in document order. */
  arts?: { nth: number; scene: string; attrs: Record<string, string> }[];
  /** Inline styles for the parent of the `nth` art element (a tile's selection ring, or hiding it). */
  tiles?: { nth: number; style: Record<string, string> }[];
  /** Inline styles to set on elements whose own text is `text`. */
  styles?: { text: string; style: Record<string, string> }[];
}

/** Edits the isolated box: copy, art and selection rings, as a screen in another state shows them. */
export function editIsolated(edits: Edits): string[] {
  const root = document.querySelector<HTMLElement>('[data-launch-isolated]');
  if (!root) throw new Error('Nothing isolated');
  const unmatched: string[] = [];
  const undo = ((window as unknown as UndoWindow).__launchUndo ??= []);
  const all = [root, ...root.querySelectorAll<HTMLElement>('*')];
  for (const { from, to } of edits.texts ?? []) {
    let found = false;
    for (const el of all) {
      const texts = [...el.childNodes].filter(
        (node): node is Text => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim(),
      );
      const text = texts[0];
      if (texts.length !== 1 || !text || text.textContent?.replace(/\s+/g, ' ').trim() !== from) {
        continue;
      }
      const before = text.textContent;
      undo.push(() => {
        text.textContent = before;
      });
      text.textContent = to;
      found = true;
    }
    if (!found) unmatched.push(from);
  }
  for (const { text, style } of edits.styles ?? []) {
    for (const el of all) {
      const own = [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (own !== text) continue;
      const css = el.style.cssText;
      undo.push(() => {
        el.style.cssText = css;
      });
      Object.assign(el.style, style);
    }
  }
  const arts = [...root.querySelectorAll<ArtElement>('kf-art')];
  for (const { nth, scene, attrs } of edits.arts ?? []) {
    const art = arts[nth];
    if (!art) {
      unmatched.push(`art ${nth}`);
      continue;
    }
    const before = art.getAttributeNames().map((name) => [name, art.getAttribute(name) ?? '']);
    undo.push(() => {
      for (const name of art.getAttributeNames()) art.removeAttribute(name);
      for (const [name, value] of before) art.setAttribute(name ?? '', value ?? '');
      art.bgc = null;
    });
    for (const name of art.getAttributeNames()) {
      if (name !== 'style' && name !== 'dpr') art.removeAttribute(name);
    }
    art.setAttribute('scene', scene);
    for (const [name, value] of Object.entries(attrs)) art.setAttribute(name, value);
    art.bgc = null;
  }
  for (const { nth, style } of edits.tiles ?? []) {
    const parent = arts[nth]?.parentElement;
    if (!parent) continue;
    const css = parent.style.cssText;
    undo.push(() => {
      parent.style.cssText = css;
    });
    Object.assign(parent.style, style);
  }
  return unmatched;
}
