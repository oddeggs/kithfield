import { type Browser } from 'playwright';

export interface Sheets {
  side: string;
  diff: string;
  mean: number;
  changed: number;
  /** Pixels that differ at all, and the largest channel difference. */
  differing: number;
  max: number;
  /** Pixels in the first image. */
  pixels: number;
}

/** Runs in the page: composes the two images on canvases and returns them as data URLs. */
export async function compose(args: { a: string; b: string; threshold: number }): Promise<Sheets> {
  const load = (src: string): Promise<HTMLImageElement> =>
    new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => fail(new Error('image failed to load'));
      img.src = src;
    });
  const [a, b] = await Promise.all([load(args.a), load(args.b)]);
  const w = a.naturalWidth;
  const h = a.naturalHeight;
  const bh = Math.round((b.naturalHeight * w) / b.naturalWidth);
  const side = document.createElement('canvas');
  side.width = w * 2 + 24;
  side.height = Math.max(h, bh);
  const s = side.getContext('2d');
  if (!s) throw new Error('no 2d context');
  s.fillStyle = '#ffffff';
  s.fillRect(0, 0, side.width, side.height);
  s.drawImage(a, 0, 0);
  s.drawImage(b, w + 24, 0, w, bh);

  const read = (img: HTMLImageElement, height: number): ImageData => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    if (!x) throw new Error('no 2d context');
    x.drawImage(img, 0, 0, w, height);
    return x.getImageData(0, 0, w, h);
  };
  const pa = read(a, h).data;
  const pb = read(b, bh).data;
  const diff = document.createElement('canvas');
  diff.width = w;
  diff.height = h;
  const d = diff.getContext('2d');
  if (!d) throw new Error('no 2d context');
  const out = d.createImageData(w, h);
  let total = 0;
  let changed = 0;
  let differing = 0;
  let max = 0;
  for (let i = 0; i < pa.length; i += 4) {
    const delta =
      (Math.abs((pa[i] ?? 0) - (pb[i] ?? 0)) +
        Math.abs((pa[i + 1] ?? 0) - (pb[i + 1] ?? 0)) +
        Math.abs((pa[i + 2] ?? 0) - (pb[i + 2] ?? 0))) /
      3;
    total += delta;
    if (delta > 0) differing++;
    max = Math.max(
      max,
      Math.abs((pa[i] ?? 0) - (pb[i] ?? 0)),
      Math.abs((pa[i + 1] ?? 0) - (pb[i + 1] ?? 0)),
      Math.abs((pa[i + 2] ?? 0) - (pb[i + 2] ?? 0)),
    );
    const grey = 255 - ((255 - ((pa[i] ?? 0) + (pa[i + 1] ?? 0) + (pa[i + 2] ?? 0)) / 3) * 0.25);
    const hot = delta > args.threshold;
    if (hot) changed++;
    out.data[i] = hot ? 230 : grey;
    out.data[i + 1] = hot ? 40 : grey;
    out.data[i + 2] = hot ? 40 : grey;
    out.data[i + 3] = 255;
  }
  d.putImageData(out, 0, 0);
  return {
    side: side.toDataURL('image/png'),
    diff: diff.toDataURL('image/png'),
    mean: total / (w * h),
    changed: changed / (w * h),
    differing,
    max,
    pixels: w * h,
  };
}


const dataUrl = (png: Buffer): string => `data:image/png;base64,${png.toString('base64')}`;

/** Compares two PNGs in a page: the side-by-side and diff sheets, and how far apart they are. */
export async function diffPngs(
  browser: Browser,
  a: Buffer,
  b: Buffer,
  threshold: number,
): Promise<Sheets> {
  const page = await browser.newPage();
  try {
    // tsx keeps function names with a `__name` helper that does not exist inside the page.
    await page.evaluate('globalThis.__name = (fn) => fn');
    return await page.evaluate(compose, { a: dataUrl(a), b: dataUrl(b), threshold });
  } finally {
    await page.close();
  }
}

/** A data URL from `diffPngs` back to PNG bytes. */
export function pngBytes(url: string): Buffer {
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}
