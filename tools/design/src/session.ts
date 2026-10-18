import { type Browser, type BrowserContext, type Frame, type Page, chromium } from 'playwright';

import {
  designBooted,
  documentHeight,
  gateArtDraws,
  drawArtAt,
  flushTasks,
  holdScriptAnimations,
  jumpTo,
  loadAllFonts,
  setTweaks,
} from './in-page';
import { routeThroughCache } from './net-cache';

/** Every page runs on a frozen clock at this instant (the canvas's own status bars say 9:41). */
export const FROZEN_TIME = Date.UTC(2026, 9, 24, 9, 41, 0);
/** Animated art is drawn at this many seconds in: late enough that reveals have finished. */
export const ART_T = 4.5;
/**
 * The instant the art engine itself uses when art holds still: its frame loop in
 * design/kithfield-art.js calls `el.draw(motion && !still ? t : 1.2)`.
 */
export const ART_STILL_T = 1.2;

export interface SessionOptions {
  origin: string;
  cacheDir: string;
  offline: boolean;
}

export interface Session {
  browser: Browser;
  options: SessionOptions;
}

export async function startSession(options: SessionOptions): Promise<Session> {
  const browser = await chromium.launch({
    // Rasterise the same way every run: one sRGB profile, no partial or threaded re-raster.
    args: [
      '--font-render-hinting=none',
      '--force-color-profile=srgb',
      '--disable-partial-raster',
      '--num-raster-threads=1',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      // Memory pressure purges font caches, and fonts rebuilt mid-run can sit a pixel apart.
      '--memory-pressure-off',
    ],
  });
  await warmSystemFonts(browser);
  return { browser, options };
}

/**
 * Lays out the system fonts once, alone, before pages render in parallel: Chromium resolves
 * `-apple-system` (SF Pro and its optical sizes) lazily, and pages that race for that first
 * resolution can place the same glyph a few pixels apart.
 */
async function warmSystemFonts(browser: Browser): Promise<void> {
  const page = await browser.newPage();
  const families = ['-apple-system,system-ui', 'ui-monospace,Menlo,monospace', 'Georgia,serif'];
  const lines = families.flatMap((family) =>
    [400, 500, 600, 700].flatMap((weight) =>
      [9, 11, 13, 15, 17, 20, 22, 26, 30, 34, 40, 60].map(
        (size) =>
          `<div style="font:${weight} ${size}px/1 ${family}">Aa Đđ ‹ › … → · • ✓ 9:41</div>`,
      ),
    ),
  );
  await page.setContent(`<body>${lines.join('')}</body>`);
  await page.evaluate(() => document.fonts.ready.then(() => document.body.offsetHeight));
  await page.screenshot();
  await page.close();
}

export async function endSession(session: Session): Promise<void> {
  await session.browser.close();
}

/**
 * A fresh browser context per page: Playwright's clock belongs to the context, so pages rendered
 * in parallel must not share one, or one page's timers would run on another's schedule.
 */
async function newContext(
  session: Session,
  viewport: { width: number; height: number },
  scale: number,
): Promise<BrowserContext> {
  const context = await session.browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  });
  const { origin, cacheDir, offline } = session.options;
  await routeThroughCache(context, origin, cacheDir, offline);
  await context.addInitScript(gateArtDraws);
  return context;
}

async function until(
  page: Page,
  what: string,
  check: () => Promise<boolean>,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what} on ${page.url()}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** The page and any design files it embeds in iframes (the website file frames the landing pages). */
async function inEveryFrame<T>(page: Page, run: (frame: Frame) => Promise<T>): Promise<T[]> {
  const frames = page.frames().filter((f) => /\.dc\.html(#.*)?$/.test(f.url()));
  return Promise.all(frames.map(run));
}

/**
 * Opens a design file on a paused clock and waits until it has fully settled: the runtime booted
 * in every frame, every font face loaded, pending timers run, and every art element drawn at the
 * fixed instant.
 */
export async function openDesignPage(
  session: Session,
  viewport: { width: number; height: number },
  scale: number,
  url: string,
): Promise<Page> {
  const context = await newContext(session, viewport, scale);
  const page = await context.newPage();
  // Installed a minute early: the installed clock runs until paused, and pausing must go forward.
  await page.clock.install({ time: FROZEN_TIME - 60_000 });
  await page.clock.pauseAt(FROZEN_TIME);
  await page.goto(url, { waitUntil: 'load' });
  await until(page, 'the design runtime', async () =>
    (await inEveryFrame(page, (f) => f.evaluate(designBooted))).every(Boolean),
  );
  await page.waitForLoadState('networkidle');
  const unloaded = await inEveryFrame(page, (f) => f.evaluate(loadAllFonts));
  if (unloaded.some((n) => n > 0)) console.warn(`  fonts failed to load on ${url}`);
  await settle(page, true, viewport.height);
  // One whole-viewport capture, thrown away: until something captures the full viewport, art
  // that was first rasterised while the page scrolled keeps a softer filter than it later has.
  await page.screenshot({ animations: 'disabled', caret: 'hide' });
  return page;
}

/**
 * Scrolls through the page once and back, so everything that starts when first seen (observers,
 * live samples) has started before any capture, instead of racing the capture's own scrolling.
 * Run after the clock advances: a sample whose loop timer fired off screen waits to be seen again.
 */
async function visitWholePage(page: Page, step: number): Promise<void> {
  const height = await page.evaluate(documentHeight);
  for (let y = 0; y < height; y += step) {
    await page.evaluate(jumpTo, y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(jumpTo, 0);
  await page.waitForTimeout(60);
}

/**
 * Runs queued renders and timers, optionally visits the whole page (in steps of `visitStep`),
 * then redraws the art at the fixed instant and holds script animations at their first frame.
 */
export async function settle(page: Page, motion: boolean, visitStep?: number): Promise<void> {
  await inEveryFrame(page, (f) => f.evaluate(flushTasks, 8));
  await page.clock.runFor(1000);
  await inEveryFrame(page, (f) => f.evaluate(flushTasks, 8));
  if (visitStep) {
    await visitWholePage(page, visitStep);
    await inEveryFrame(page, (f) => f.evaluate(flushTasks, 8));
  }
  const blank = await inEveryFrame(page, (f) =>
    f.evaluate(drawArtAt, { t: ART_T, stillT: ART_STILL_T, motion }),
  );
  await inEveryFrame(page, (f) => f.evaluate(holdScriptAnimations));
  const total = blank.reduce((a, b) => a + b, 0);
  if (total > 0) console.warn(`  ${total} art elements did not draw on ${page.url()}`);
}

/** Switches the page's tweaks and settles again. */
export async function applyTweaks(page: Page, props: Record<string, unknown>): Promise<void> {
  await page.evaluate(setTweaks, props);
  await settle(page, props['motion'] !== false, page.viewportSize()?.height ?? 1000);
}

/** Closes a page from `openDesignPage` together with its context. */
export async function closeDesignPage(page: Page): Promise<void> {
  await page.context().close();
}
