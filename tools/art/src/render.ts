import type { Art, SceneAttrs } from '@kithfield/art';
import { createNodeArt, premulPixels } from '@kithfield/art/node';
import { isLanguage, t, type Language, type StringKey } from '@kithfield/i18n';

import type { CaptionKey } from '@kithfield/art/stickers';

/** A critter as the sticker scene draws it. */
export interface Look {
  readonly kind: string;
  readonly coat?: string;
  readonly mark?: string;
  readonly outfit?: string;
  readonly ocolor?: string;
}

/** One frame: premultiplied RGBA, row by row. */
export interface Frame {
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** A loop: its frames at `fps`. */
export interface Loop {
  readonly frames: readonly Frame[];
  readonly fps: number;
}

/** The renderer, and the errors any scene reported while drawing. */
export async function stickerArt(): Promise<{ art: Art; errors: string[] }> {
  const errors: string[] = [];
  const art = await createNodeArt({ onError: (m) => errors.push(m) });
  return { art, errors };
}

export function languageOf(value: string | undefined): Language {
  return value && isLanguage(value) ? value : 'en';
}

/** The words on a sticker in a language; a caption the catalogue lacks reads as its key. */
export function captionText(
  lang: Language,
  caption: CaptionKey,
  params: Readonly<Record<string, string>> = {},
): string {
  const key = `stickers.cap.${caption}` as StringKey;
  const text = (t as (l: Language, k: string, p?: Record<string, string>) => string)(
    lang,
    key,
    params,
  );
  return text;
}

/** The sticker scene's attributes for a critter in a pose with its words. */
export function stickerAttrs(look: Look, pose: string, caption: string): SceneAttrs {
  return {
    kind: look.kind,
    ...(look.coat ? { coat: look.coat } : {}),
    ...(look.mark ? { mark: look.mark } : {}),
    ...(look.outfit ? { outfit: look.outfit } : {}),
    ...(look.ocolor ? { ocolor: look.ocolor } : {}),
    pose,
    // An empty caption would draw the pose's own English words; '-' draws none.
    caption: caption === '' ? '-' : caption,
  };
}

/** Renders `count` frames of a scene at `fps`, at `size` device pixels square. */
export function renderLoop(
  art: Art,
  attrs: SceneAttrs,
  size: number,
  fps: number,
  count: number,
): Loop {
  const frames: Frame[] = [];
  for (let i = 0; i < count; i++) {
    const image = art.image(
      { scene: 'sticker', width: size, height: size, dpr: 1, attrs },
      i / fps,
    );
    if (!image) throw new Error(`sticker ${String(attrs['pose'])}: nothing drawn`);
    frames.push({ rgba: premulPixels(image), width: size, height: size });
  }
  return { frames, fps };
}
