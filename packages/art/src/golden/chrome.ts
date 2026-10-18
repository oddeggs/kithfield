import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fontFaces } from '@kithfield/theme';
import { chromium, type Browser, type Page } from 'playwright';

import { themeFontDir } from '../node/fonts';
import type { GoldenScene } from './scenes';

const ORIGIN = 'http://kithfield-art.test';
const SCRIPT = join(import.meta.dirname, '../vendor/kithfield-art.generated.js');

/** The theme's fonts as `@font-face` rules, so Chrome and Skia draw the same faces. */
function fontCss(): string {
  return fontFaces
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';font-weight:${f.weight};src:url('${ORIGIN}/fonts/${f.file}')}`,
    )
    .join('\n');
}

/** Runs in the page: waits for the fonts, then draws one scene and returns its pixels. */
const HARNESS = `
window.__ready = Promise.all(${JSON.stringify(fontFaces.map((f) => `${f.weight} 20px '${f.family}'`))}
  .map((f) => document.fonts.load(f))).then(() => document.fonts.ready);
window.__render = (s) => {
  const el = document.createElement('kf-art');
  el.style.cssText = 'display:block;position:absolute;left:0;top:0;width:' + s.width + 'px;height:' + s.height + 'px';
  el.setAttribute('scene', s.scene);
  el.setAttribute('dpr', String(s.dpr));
  for (const [k, v] of Object.entries(s.attrs)) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, String(v));
  }
  document.body.appendChild(el);
  el.draw(s.t);
  const { width, height } = el.cv;
  const data = el.ctx.getImageData(0, 0, width, height).data;
  el.remove();
  let bin = '';
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return { width, height, b64: btoa(bin) };
};`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss()}
html,body{margin:0;background:transparent}
</style><script src="${ORIGIN}/kithfield-art.js"></script><script>${HARNESS}</script></head><body></body></html>`;

const CHROME_ARGS = [
  '--disable-gpu',
  '--disable-accelerated-2d-canvas',
  '--force-color-profile=srgb',
  '--font-render-hinting=none',
];

/**
 * The original renderer in headless Chrome, drawing on the browser's own canvas. Software
 * rasterisation and an sRGB profile keep it deterministic.
 */
export class ChromeArt {
  private constructor(
    private readonly browser: Browser,
    private readonly page: Page,
  ) {}

  /**
   * Launches Chromium, or connects to a Playwright server at `KF_ART_PLAYWRIGHT_WS` (to compare
   * against Linux Chrome, as CI does, from a Mac: `playwright run-server` in the Playwright image).
   */
  static async launch(): Promise<ChromeArt> {
    const ws = process.env['KF_ART_PLAYWRIGHT_WS'];
    const browser = ws
      ? await chromium.connect(ws, {
          headers: { 'x-playwright-launch-options': JSON.stringify({ args: CHROME_ARGS }) },
        })
      : await chromium.launch({ args: CHROME_ARGS });
    const page = await browser.newPage();
    const fonts = themeFontDir();
    await page.route(`${ORIGIN}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ body: PAGE, contentType: 'text/html' });
      if (path === '/kithfield-art.js') {
        return route.fulfill({ body: readFileSync(SCRIPT), contentType: 'text/javascript' });
      }
      if (path.startsWith('/fonts/')) {
        return route.fulfill({
          body: readFileSync(join(fonts, path.slice(7))),
          contentType: 'font/ttf',
        });
      }
      return route.fulfill({ status: 404 });
    });
    await page.goto(`${ORIGIN}/`);
    await page.evaluate('window.__ready');
    return new ChromeArt(browser, page);
  }

  /** The scene's pixels, unpremultiplied RGBA as `getImageData` returns them. */
  async render(scene: GoldenScene): Promise<{ width: number; height: number; rgba: Uint8Array }> {
    const out = await this.page.evaluate<{ width: number; height: number; b64: string }>(
      `window.__render(${JSON.stringify(scene)})`,
    );
    return {
      width: out.width,
      height: out.height,
      rgba: new Uint8Array(Buffer.from(out.b64, 'base64')),
    };
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
