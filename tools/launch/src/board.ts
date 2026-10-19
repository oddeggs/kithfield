import { join } from 'node:path';

import {
  ART_STILL_T,
  ART_T,
  type Session,
  applyTweaks,
  closeDesignPage,
  endSession,
  openDesignPage,
  startSession,
} from '@kithfield/design/src/session';
import { serveDirectory, type StaticServer } from '@kithfield/design/src/server';
import { type Page } from 'playwright';

import {
  type BoxInfo,
  type Rewrite,
  type RewriteArgs,
  type Edits,
  editIsolated,
  tagFrame,
  drawIsolatedAt,
  isolate,
  listBoxes,
  restore,
  rewriteIsolated,
  rewritesBetween,
  setArtAttributes,
} from './in-page';
import { DESIGN_DIR, TOOL_DIR } from './paths';

/**
 * The page a board is laid out on. Every asset box has a fixed CSS size, so the layout width only
 * decides how boards wrap; the height is kept small at high scales so the page's own full-viewport
 * captures stay a sane number of device pixels.
 */
function boardViewport(deviceScale: number): { width: number; height: number } {
  const width = 1600;
  const height = Math.round(Math.min(1200, Math.max(120, 40e6 / (width * deviceScale ** 2))));
  return { width, height };
}

export interface Boards {
  /** One page of a design file, laid out at `deviceScale` device pixels per CSS pixel. */
  open(file: string, deviceScale: number, tweaks?: Record<string, unknown>): Promise<Board>;
  close(): Promise<void>;
}

export interface CaptureOptions {
  /** Seconds into the art's motion; still art always holds its own still time. */
  t?: number;
  keepFrame?: boolean;
  /** Art attributes to change before drawing, by selector inside the box. */
  art?: { selector: string; attrs: Record<string, string | null> }[];
  /** Rewrites the box's copy (into Vietnamese, or the board's words into the app's). */
  rewrite?: RewriteArgs;
  /** Shows the box in another state: other copy, other art. */
  edits?: Edits;
}

export interface Board {
  readonly page: Page;
  readonly deviceScale: number;
  boxes(label: string): Promise<BoxInfo[]>;
  rewrites(en: string, vi: string): Promise<Record<string, Rewrite>>;
  /**
   * Captures one box of a frame (`label`, box index) at the page's scale. Returns the PNG and the
   * English copy left in it when rewriting.
   */
  capture(
    label: string,
    index: number | 'frame',
    options?: CaptureOptions,
  ): Promise<{ png: Buffer; untranslated: string[] }>;
  /** Lifts a box out for a sequence of frames: `frame(t)` draws and captures one. */
  sequence(
    label: string,
    index: number,
    options?: CaptureOptions,
  ): Promise<{ frame(t: number): Promise<Buffer>; done(): Promise<void> }>;
  close(): Promise<void>;
}

export async function openBoards(): Promise<Boards> {
  const server: StaticServer = await serveDirectory(DESIGN_DIR);
  const session: Session = await startSession({
    origin: server.origin,
    cacheDir: join(TOOL_DIR, 'node_modules/.cache/kithfield-launch'),
    offline: false,
  });
  return {
    async open(file, deviceScale, tweaks) {
      const url = `${server.origin}/${encodeURIComponent(file)}`;
      const page = await openDesignPage(session, boardViewport(deviceScale), deviceScale, url);
      if (tweaks) await applyTweaks(page, tweaks);
      return board(page, deviceScale);
    },
    async close() {
      await endSession(session);
      await server.close();
    },
  };
}

function board(page: Page, deviceScale: number): Board {
  const lift = async (label: string, index: number | 'frame', options: CaptureOptions) => {
    if (index === 'frame') await page.evaluate(tagFrame, label);
    else await page.evaluate(listBoxes, label);
    const selector = `[data-launch-box="${label}:${index}"]`;
    const size = await page.evaluate(isolate, {
      selector,
      deviceScale,
      ...(options.keepFrame ? { keepFrame: true } : {}),
    });
    for (const change of options.art ?? []) await page.evaluate(setArtAttributes, change);
    if (options.edits) {
      const unmatched = await page.evaluate(editIsolated, options.edits);
      if (unmatched.length > 0)
        throw new Error(`${label}: nothing to edit for ${unmatched.join(', ')}`);
    }
    const untranslated = options.rewrite
      ? await page.evaluate(rewriteIsolated, options.rewrite)
      : [];
    await page.setViewportSize({ width: Math.ceil(size.width), height: Math.ceil(size.height) });
    await page.evaluate(() => document.fonts.ready.then(() => document.body.offsetHeight));
    return { size, untranslated };
  };
  const shoot = async (size: { width: number; height: number }, t: number, animate: boolean) => {
    const blank = await page.evaluate(drawIsolatedAt, { t, stillT: ART_STILL_T, animate });
    if (blank > 0) console.warn(`  ${blank} art elements did not draw`);
    return page.screenshot({
      clip: { x: 0, y: 0, width: size.width, height: size.height },
      // A still keeps the board's own rule (CSS motion finished, script motion at its start); a
      // sequence has already moved every animation to its frame.
      animations: animate ? 'allow' : 'disabled',
      caret: 'hide',
      timeout: 120_000,
    });
  };
  const putBack = async () => {
    await page.evaluate(restore);
    await page.setViewportSize(boardViewport(deviceScale));
  };
  return {
    page,
    deviceScale,
    boxes: (label) => page.evaluate(listBoxes, label),
    rewrites: (en, vi) => page.evaluate(rewritesBetween, { en, vi }),
    async capture(label, index, options = {}) {
      const { size, untranslated } = await lift(label, index, options);
      try {
        return { png: await shoot(size, options.t ?? ART_T, false), untranslated };
      } finally {
        await putBack();
      }
    },
    async sequence(label, index, options = {}) {
      const { size } = await lift(label, index, options);
      return { frame: (t) => shoot(size, t, true), done: putBack };
    },
    close: () => closeDesignPage(page),
  };
}
