import type { LanguageTag } from '@kithfield/contracts';

import { type AiBinding, transcribe, translate } from '../ai';
import { perksOn } from '../purchases/entitlements';
import { type CaptionedAudio, setCaptionAudio, setCaptionPerks } from './captions';

/*
 * The fire's captions seams, filled from the features they need: Workers AI hears each piece of
 * speech once and translates it into the other languages asked for (`ai/models.ts`), and the
 * shop's entitlements say whose patron perks are on (Plus or patron, `docs/products.md`).
 */

/** One piece of speech, heard and put into each of `langs` it wasn't said in. */
export async function captionWith(
  ai: AiBinding,
  chunk: Uint8Array,
  langs: readonly LanguageTag[],
): Promise<CaptionedAudio> {
  const heard = await transcribe(ai, chunk);
  const others = heard.text === '' ? [] : [...new Set(langs)].filter((l) => l !== heard.said);
  // A language the model can't reach gets the line as it was said.
  const translated = await Promise.all(
    others.map((lang) =>
      translate(ai, heard.text, heard.said, lang).then(
        (text): [string, string] | null => [lang, text],
        () => null,
      ),
    ),
  );
  return {
    said: heard.said,
    text: heard.text,
    translations: Object.fromEntries(translated.filter((t) => t !== null)),
  };
}

/** Fills both seams, so the fire's captions are available. */
export function fillCaptionSeams(): void {
  setCaptionAudio((env, chunk, langs) => captionWith(env.AI, chunk, langs));
  setCaptionPerks((env, person) => perksOn(env.DB, person, Date.now()));
}
