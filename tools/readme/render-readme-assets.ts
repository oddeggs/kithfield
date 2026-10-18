// Usage: pnpm --filter @kithfield/readme render (writes the README images to docs/assets/readme/)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join } from 'node:path';

import { chromium, type Browser, type Page } from 'playwright';

const repo = join(import.meta.dirname, '../..');
const designDir = join(repo, 'design');
const outDir = join(repo, 'docs/assets/readme');
const port = 8831;
const paper = '#F5EEE2';

/** The viewport a design page is opened at, in CSS pixels. */
type View = { width?: number; height?: number };
/** One phone screen: a design file and the screen id. */
type Phone = { file: string; id: string };

/** Serves `design/` as it is: the pages load the art module and support script by relative path. */
function serve(): Promise<Server> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    readFile(join(designDir, path))
      .then((body) => {
        const type = { '.html': 'text/html', '.js': 'text/javascript' }[extname(path)];
        res.writeHead(200, { 'content-type': type ?? 'application/octet-stream' });
        res.end(body);
      })
      .catch(() => res.writeHead(404).end());
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

async function open(browser: Browser, file: string, view: View = {}): Promise<Page> {
  const { width = 1440, height = 1100 } = view;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${port}/${encodeURIComponent(file)}.dc.html`, {
    waitUntil: 'networkidle',
  });
  await page.evaluate(() => document.fonts.ready);
  // Hold the art still (as with Reduce Motion) so every run draws the same frame.
  await page.waitForFunction(() => 'KF' in window);
  await page.evaluate(() =>
    (window as unknown as { KF: { setMotion(m: boolean): void } }).KF.setMotion(false),
  );
  return page;
}

/** Waits until every `<kf-art>` inside the element has drawn its cached background and frame. */
async function waitForArt(page: Page, selector: string): Promise<void> {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const handle = await target.elementHandle();
  if (!handle) throw new Error(`${selector} is not on the page`);
  await page.waitForFunction((root) => {
    const arts = [...root.querySelectorAll('kf-art')] as (HTMLElement & {
      bgc?: unknown;
      dirty?: boolean;
    })[];
    // Art off screen never draws, and isn't in the picture.
    return arts.every((a) => {
      const r = a.getBoundingClientRect();
      const onScreen =
        r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      return !onScreen || (a.bgc != null && !a.dirty);
    });
  }, handle);
  await page.waitForTimeout(400);
}

async function phone(browser: Browser, { file, id }: Phone): Promise<Buffer> {
  const page = await open(browser, file);
  const selector = `[data-screen-label^="${id}"]`;
  await waitForArt(page, selector);
  const shot = await page.locator(selector).first().screenshot();
  await page.close();
  return shot;
}

/** Lays phone screens side by side in the design's bezel, on a rounded paper card. */
async function phones(browser: Browser, list: Phone[]): Promise<Buffer> {
  const shots = [];
  for (const p of list) shots.push((await phone(browser, p)).toString('base64'));
  const page = await browser.newPage({
    viewport: { width: 400, height: 400 },
    deviceScaleFactor: 1,
  });
  const imgs = shots
    .map(
      (b64) =>
        `<img src="data:image/png;base64,${b64}" style="width:393px;height:852px;border-radius:56px;box-shadow:0 0 0 11px #1d1a18,0 0 0 12.5px #4a4441,0 40px 70px -24px rgba(50,35,20,.5)">`,
    )
    .join('');
  await page.setContent(
    `<body style="margin:0;background:transparent"><div id="card" style="display:inline-flex;gap:56px;padding:44px 52px 60px;background:${paper};border-radius:28px">${imgs}</div></body>`,
  );
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  // The phones were captured at 2x, so this 1x layout keeps their full resolution.
  const shot = await page.locator('#card').screenshot({ omitBackground: true, scale: 'device' });
  await page.close();
  return shot;
}

/** A region of a design page, by selector, with some of the page hidden. */
async function region(
  browser: Browser,
  file: string,
  selector: string,
  opts: View & { hide?: string[] } = {},
): Promise<Buffer> {
  const page = await open(browser, file, opts);
  for (const h of opts.hide ?? [])
    await page.addStyleTag({ content: `${h}{visibility:hidden!important}` });
  await waitForArt(page, selector);
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${file}: ${selector} is not on the page`);
  const shot = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  });
  await page.close();
  return shot;
}

/** Re-encodes a PNG as WebP in Chromium, at most `maxWidth` wide, so no image library is needed. */
async function webp(
  browser: Browser,
  png: Buffer,
  maxWidth: number,
  quality = 0.86,
): Promise<Buffer> {
  const page = await browser.newPage();
  const data = await page.evaluate(
    async ({ b64, maxWidth, quality }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const k = Math.min(1, maxWidth / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * k);
      canvas.height = Math.round(img.naturalHeight * k);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', quality).split(',')[1] ?? '';
    },
    { b64: png.toString('base64'), maxWidth, quality },
  );
  await page.close();
  return Buffer.from(data, 'base64');
}

async function save(name: string, data: Buffer): Promise<void> {
  await writeFile(join(outDir, name), data);
  console.log(`${name}  ${Math.round(data.length / 1024)} KB`);
}

const server = await serve();
const browser = await chromium.launch();
try {
  await mkdir(outDir, { recursive: true });
  const strip = async (name: string, list: Phone[]) =>
    save(name, await webp(browser, await phones(browser, list), 1800));

  // The top of the landing page, without the site's nav and its "scroll to spend an evening" hint.
  const hero = await region(browser, '17 Landing', '[data-kf="stage"]', {
    height: 900,
    hide: ['nav[data-kf="nav"]', '[data-a="-1"][data-b="0.025"]'],
  });
  await save('hero.webp', await webp(browser, hero, 2400, 0.9));

  await strip('farm-and-chat.webp', [
    { file: '04 Farm and Chat', id: '04-01' },
    { file: '12 States', id: '12-08' },
    { file: '04 Farm and Chat', id: '04-03' },
  ]);
  await strip('gestures.webp', [
    { file: '05 Gestures', id: '05-02' },
    { file: '05 Gestures', id: '05-03' },
    { file: '05 Gestures', id: '05-06' },
  ]);
  await strip('plans-and-the-fire.webp', [
    { file: '06 Plans and Hangouts', id: '06-04' },
    { file: '16 Fire Room and Calls', id: '16-02' },
    { file: '16 Fire Room and Calls', id: '16-07' },
  ]);

  // At this width the cast's card grid fits all sixteen critters in two rows.
  const cast = await region(
    browser,
    '02 Cast',
    'main > div:has(> div > div:text-is("Sixteen friends")) > div:nth-child(2)',
    { width: 2400 },
  );
  await save('critter-cast.webp', await webp(browser, cast, 2400));

  const seasons = await region(browser, '15 Farm and Field Guide', '[data-screen-label^="15-03"]');
  await save('seasons.webp', await webp(browser, seasons, 1800));
} finally {
  await browser.close();
  server.close();
}
