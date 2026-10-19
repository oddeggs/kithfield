import { describe, expect, it, vi } from 'vitest';

import { Art } from '../art';
import { loadNodeSkia, nodeFaces } from '../node';
import { parseFont, type ParsedFont } from './font';

async function newArt(): Promise<Art> {
  const skia = await loadNodeSkia();
  return new Art({ skia, faces: nodeFaces(skia) });
}

const caption = "700 30px Gaegu, 'Comic Sans MS', cursive";

describe('words the listed faces cannot write', () => {
  it('writes a whole Vietnamese caption in Patrick Hand, a little smaller', async () => {
    const art = await newArt();
    const font = parseFont(caption);
    if (!font) throw new Error('unparsed');
    art.env.fonts.missingGlyphs = 0;
    const runs = art.env.fonts.shape('nhớ ghê', font);
    expect(art.env.fonts.missingGlyphs).toBe(0);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.font.getSize()).toBeCloseTo(27, 0);
    expect(runs[0]?.glyphs.every((g) => g !== 0)).toBe(true);
  });

  it('keeps words the listed face can write in that face', async () => {
    const art = await newArt();
    const font = parseFont(caption);
    if (!font) throw new Error('unparsed');
    const runs = art.env.fonts.shape('miss you', font);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.font.getSize()).toBe(30);
  });

  it('draws the Vietnamese sticker with every glyph', async () => {
    const art = await newArt();
    art.env.fonts.missingGlyphs = 0;
    const image = art.image(
      {
        scene: 'sticker',
        width: 200,
        height: 200,
        dpr: 1,
        attrs: { kind: 'rabbit', pose: 'miss', caption: 'nhớ ghê', lang: 'vi' },
      },
      1.2,
    );
    expect(image).not.toBeNull();
    expect(art.env.fonts.missingGlyphs).toBe(0);
  });

  it('leaves the Vietnamese sticker caption to the art, which sets it in Patrick Hand', async () => {
    const art = await newArt();
    const fonts = art.env.fonts;
    const shaped: { text: string; font: ParsedFont; size: number | undefined }[] = [];
    const shape = fonts.shape.bind(fonts);
    vi.spyOn(fonts, 'shape').mockImplementation((text, font) => {
      const runs = shape(text, font);
      shaped.push({ text, font, size: runs[0]?.font.getSize() });
      return runs;
    });
    art.image(
      {
        scene: 'sticker',
        width: 200,
        height: 200,
        dpr: 1,
        attrs: { kind: 'rabbit', pose: 'miss', caption: 'nhớ ghê', lang: 'vi' },
      },
      1.2,
    );
    const caption = shaped.filter((s) => s.text === 'nhớ ghê');
    expect(caption.length).toBeGreaterThan(0);
    for (const s of caption) {
      expect(s.font.families[0]).toBe('Patrick Hand');
      // Drawn at the size the art asked for: the fallback's own shrinking never steps in.
      expect(s.size).toBe(s.font.size);
    }
  });
});
