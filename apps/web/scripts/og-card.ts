/**
 * Lays out the link-preview cards on the art package's Canvas 2D adapter: the
 * scene drawn by the renderer, the paper wash over it and the type, as the design sets them in
 * CSS pixels at 600 × 315 and bakes at 2×.
 */
import type { Art, SceneRequest } from '@kithfield/art';
import { encodePng } from '@kithfield/art/node';

type Ctx = NonNullable<ReturnType<ReturnType<Art['canvas']>['getContext']>>;

export const CARD = { width: 600, height: 315, scale: 2 } as const;
const PAPER = '#F5EEE2';
const INK = '#2a221d';
const MOSS = '#5E7F4A';
/** Animated scenes are baked at the instant the design renders use. */
const BAKE_T = 4.5;

export interface CardFaces {
  serif: string;
  hand: string;
}

function roundedClip(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
  c.clip();
}

/** Draws a scene at CSS size (w × h) placed at (x, y), clipped to a radius when given. */
function scene(
  art: Art,
  c: Ctx,
  req: Omit<SceneRequest, 'width' | 'height' | 'dpr'>,
  box: { x: number; y: number; w: number; h: number; r?: number },
): void {
  const drawn = art.draw({ ...req, width: box.w, height: box.h, dpr: CARD.scale }, BAKE_T);
  c.save();
  if (box.r) roundedClip(c, box.x, box.y, box.w, box.h, box.r);
  c.drawImage(drawn, box.x, box.y, box.w, box.h);
  c.restore();
}

/** Breaks text into lines no wider than `width` in the current font. */
function wrap(c: Ctx, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && c.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Text set like CSS `font: <size>/<lineHeight>`, top-aligned in its line box. Returns the height. */
function block(
  c: Ctx,
  text: string,
  at: { x: number; y: number; width: number },
  font: { css: string; size: number; lineHeight: number; colour: string },
): number {
  c.font = `${font.css.replace('{size}', String(font.size))}`;
  c.fillStyle = font.colour;
  c.textBaseline = 'middle';
  const lines = wrap(c, text, at.width);
  const lh = font.size * font.lineHeight;
  lines.forEach((l, i) => c.fillText(l, at.x, at.y + lh * i + lh / 2));
  return lh * lines.length;
}

function blankCard(art: Art): { canvas: ReturnType<Art['canvas']>; c: Ctx } {
  const canvas = art.canvas(CARD.width * CARD.scale, CARD.height * CARD.scale);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('No 2D context');
  c.setTransform(CARD.scale, 0, 0, CARD.scale, 0, 0);
  c.fillStyle = PAPER;
  c.fillRect(0, 0, CARD.width, CARD.height);
  return { canvas, c };
}

/** The home page's card: the farm at night on the right, the name and the promise on the left. */
export function homeCard(
  art: Art,
  faces: CardFaces,
  copy: { brand: string; title: string; line: string },
): Uint8Array {
  const { canvas, c } = blankCard(art);
  scene(
    art,
    c,
    {
      scene: 'farm',
      attrs: { night: 'true', lit: 'rabbit,hedgehog,frog,sheep', season: 'spring' },
    },
    { x: CARD.width - 360, y: -20, w: 360, h: 360 },
  );
  const wash = c.createLinearGradient(0, 0, CARD.width, 0);
  wash.addColorStop(0.48, PAPER);
  wash.addColorStop(0.7, 'rgba(245,238,226,0)');
  c.fillStyle = wash;
  c.fillRect(0, 0, CARD.width, CARD.height);

  scene(art, c, { scene: 'appicon' }, { x: 32, y: 40, w: 28, h: 28, r: 7 });
  block(
    c,
    copy.brand,
    { x: 68, y: 45, width: 260 },
    {
      css: `400 {size}px ${faces.serif}`,
      size: 18,
      lineHeight: 1,
      colour: INK,
    },
  );
  const titleH = block(
    c,
    copy.title,
    { x: 32, y: 80, width: 300 },
    {
      css: `400 {size}px ${faces.serif}`,
      size: 38,
      lineHeight: 1.04,
      colour: INK,
    },
  );
  block(
    c,
    copy.line,
    { x: 32, y: 80 + titleH + 12, width: 300 },
    {
      css: `700 {size}px ${faces.hand}`,
      size: 17,
      lineHeight: 1.1,
      colour: MOSS,
    },
  );
  return encodePng(canvas);
}

/** The invite card: the gate and the saved cottage, with who it's from and the farm. */
export function inviteCard(
  art: Art,
  faces: CardFaces,
  copy: { from: string; title: string },
): Uint8Array {
  const { canvas, c } = blankCard(art);
  scene(
    art,
    c,
    { scene: 'invite', attrs: { season: 'spring' } },
    {
      x: 0,
      y: 0,
      w: CARD.width,
      h: CARD.height,
    },
  );
  const wash = c.createLinearGradient(0, 0, 0, CARD.height);
  wash.addColorStop(0.3, PAPER);
  wash.addColorStop(0.62, 'rgba(245,238,226,0)');
  c.fillStyle = wash;
  c.fillRect(0, 0, CARD.width, CARD.height);

  scene(
    art,
    c,
    { scene: 'avatar', attrs: { kind: 'rabbit' } },
    { x: 28, y: 26, w: 30, h: 30, r: 15 },
  );
  block(
    c,
    copy.from,
    { x: 66, y: 33, width: 500 },
    {
      css: `700 {size}px ${faces.hand}`,
      size: 16,
      lineHeight: 1,
      colour: MOSS,
    },
  );
  block(
    c,
    copy.title,
    { x: 28, y: 64, width: CARD.width - 56 },
    {
      css: `400 {size}px ${faces.serif}`,
      size: 30,
      lineHeight: 1.08,
      colour: INK,
    },
  );
  return encodePng(canvas);
}
