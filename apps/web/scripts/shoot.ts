/**
 * Screenshots the site the way `tools/design` renders `design/17 *.dc.html`, so each page can be
 * compared with its render (`pnpm --filter @kithfield/design compare`):
 *
 *   pnpm --filter @kithfield/web shoot -- --base http://127.0.0.1:4321 --out <dir> [--only landing]
 *
 * - The landing pages at 390, 834 and 1440 wide, one viewport per scroll stop that
 *   `design/renders/index.json` lists for it, at the render's scale.
 * - The website's other pages at the width of their browser frame in the design; their renders
 *   are cropped to the page inside the frame (`<id>.crop.png`) so the two line up.
 *
 * `screens.json` names the page each render shows.
 *
 * As in the renders, the art is drawn at one instant (4.5 s into its loop) once the fonts are in,
 * and transitions are settled before each capture.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { chromium, type Page } from 'playwright';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    base: { type: 'string', default: 'http://127.0.0.1:4321' },
    out: { type: 'string' },
    only: { type: 'string' },
  },
});
if (!values.out) throw new Error('--out <dir> is required');
const out = resolve(process.env.INIT_CWD ?? process.cwd(), values.out);
mkdirSync(out, { recursive: true });
const rendersDir = join(import.meta.dirname, '../../../design/renders');

interface RenderEntry {
  kind: string;
  file: string;
  title: string;
  width: number;
  height: number;
  scale: number;
}
/** Which page each render shows, by the render's id (`screens.json`, beside this script). */
const screens = JSON.parse(readFileSync(join(import.meta.dirname, 'screens.json'), 'utf8')) as {
  scrolling: Record<string, string>;
  framed: Record<string, string>;
};
const index = JSON.parse(readFileSync(join(rendersDir, 'index.json'), 'utf8')) as {
  renders: Record<string, RenderEntry>;
};

/** Lets the art draw only when asked, as the design renderer does, so captures are repeatable. */
function gateArt(): void {
  const define = customElements.define.bind(customElements);
  customElements.define = function (name, constructor, options) {
    const proto = constructor.prototype as { draw?: (t: number) => void };
    const draw = proto.draw;
    if (name === 'kf-art' && typeof draw === 'function') {
      proto.draw = function (this: unknown, t: number) {
        if ((window as unknown as { __kfDraw?: boolean }).__kfDraw) draw.call(this, t);
      };
    }
    define(name, constructor, options);
  };
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const w = window as unknown as { __kfDraw?: boolean };
    w.__kfDraw = true;
    for (const el of document.querySelectorAll<
      HTMLElement & { draw?: (t: number) => void; bgc: unknown }
    >('kf-art')) {
      if (typeof el.draw !== 'function') continue;
      el.bgc = null;
      el.draw(el.hasAttribute('still') ? 1.2 : 4.5);
    }
    w.__kfDraw = false;
  });
}

async function open(
  width: number,
  height: number,
  scale: number,
  path: string,
  prepare?: (page: Page) => Promise<void>,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });
  await context.addInitScript(gateArt);
  const page = await context.newPage();
  await prepare?.(page);
  await page.goto(new URL(path, values.base).href, { waitUntil: 'load' });
  await page.mouse.move(1, 1);
  await page.waitForFunction(() => !!customElements.get('kf-art'));
  await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
    await document.fonts.ready;
  });
  return { page, close: () => context.close() };
}

const browser = await chromium.launch();
const shots: string[] = [];
try {
  if (!values.only || values.only === 'landing') {
    for (const [slug, path] of Object.entries(screens.scrolling)) {
      for (const width of [390, 834, 1440]) {
        const stops = Object.entries(index.renders)
          .filter(([id]) => id.startsWith(`${slug}/${width}/`))
          .map(([id, r]) => ({ id, r, y: Number(/scrolled to (\d+)/.exec(r.title)?.[1] ?? 0) }));
        const first = stops[0]?.r;
        if (!first) continue;
        const { page, close } = await open(width, first.height, first.scale, path);
        // Scroll the whole page once, so anything that starts when first seen has started.
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < height; y += first.height)
          await page.evaluate((v) => scrollTo({ top: v, behavior: 'instant' }), y);
        for (const stop of stops) {
          await page.evaluate((v) => scrollTo({ top: v, behavior: 'instant' }), stop.y);
          await settle(page);
          const file = join(out, `${stop.id.replace(/\//g, '_')}.png`);
          writeFileSync(file, await page.screenshot({ animations: 'disabled', caret: 'hide' }));
          shots.push(file);
        }
        await close();
      }
    }
  }

  if (!values.only || values.only === 'pages') {
    // Each framed screen's page, at the width of its frame (the render less 14 px each side).
    for (const [id, path] of Object.entries(screens.framed)) {
      const render = index.renders[id];
      if (!render) continue;
      const width = render.width - 28;
      // The frame sits 14 px in, under a 44 px browser bar.
      const height = render.height - 28 - 44;
      const { page, close } = await open(width, height, render.scale, path, invitePreview);
      await settle(page);
      const file = join(out, `${id}.png`);
      writeFileSync(file, await page.screenshot({ animations: 'disabled', caret: 'hide' }));
      shots.push(file);
      await cropRender(page, join(rendersDir, render.file), join(out, `${id}.crop.png`), {
        x: 14,
        y: 14 + 44,
        width,
        height,
        scale: render.scale,
      });
      await close();
    }
  }
} finally {
  await browser.close();
}
console.log(shots.join('\n'));

/**
 * The invite page reads its farm from the API; screenshots answer with the design's sample farm
 * (a double at the network edge, for this tool only).
 */
async function invitePreview(page: Page): Promise<void> {
  const critter = (species: string) => ({
    species,
    coat: 'default',
    mark: null,
    accessory: null,
    outfit: null,
    outfitColor: null,
    companion: null,
    cottage: null,
  });
  const kinds = ['rabbit', 'hedgehog', 'frog', 'sheep', 'owl', 'fox', 'bear', 'cat'];
  await page.route('**/api/v1/invites/*', (route) =>
    route.fulfill({
      json: {
        name: 'The Thursday Lot',
        land: 'meadow',
        critters: Array.from({ length: 14 }, (_, i) => critter(kinds[i % kinds.length] ?? 'owl')),
        full: false,
        approval: false,
      },
    }),
  );
}

/** Cuts the page out of a framed render, at the render's scale. */
async function cropRender(
  page: Page,
  from: string,
  to: string,
  box: { x: number; y: number; width: number; height: number; scale: number },
): Promise<void> {
  const data = readFileSync(from).toString('base64');
  const png = await page.evaluate(
    async ({ data, box }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = box.width * box.scale;
      c.height = box.height * box.scale;
      c.getContext('2d')?.drawImage(
        img,
        box.x * box.scale,
        box.y * box.scale,
        c.width,
        c.height,
        0,
        0,
        c.width,
        c.height,
      );
      return c.toDataURL('image/png').split(',')[1] ?? '';
    },
    { data, box },
  );
  writeFileSync(to, Buffer.from(png, 'base64'));
}
