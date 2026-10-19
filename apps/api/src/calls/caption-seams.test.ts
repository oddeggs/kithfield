import { describe, expect, it } from 'vitest';

import { type AiBinding, TRANSLATION_MODEL } from '../ai/models';
import { ScriptedAi } from '../ai/support.test-data';
import { captionWith } from './caption-seams';

const piece = new Uint8Array([82, 73, 70, 70]);
const hear = (ai: ScriptedAi, langs: Parameters<typeof captionWith>[2]) =>
  captionWith(ai as unknown as AiBinding, piece, langs);

describe('a piece of speech by the fire', () => {
  it('is heard once and translated into each other language asked for', async () => {
    const ai = new ScriptedAi()
      .hears('Thứ bảy mình mang bánh nhé', 'vi')
      .translates('Cakes on Saturday');
    const heard = await hear(ai, ['vi', 'en', 'en']);
    expect(heard).toEqual({
      said: 'vi',
      text: 'Thứ bảy mình mang bánh nhé',
      translations: { en: 'Cakes on Saturday' },
    });
    expect(ai.of(TRANSLATION_MODEL)).toEqual([
      {
        model: TRANSLATION_MODEL,
        input: { text: 'Thứ bảy mình mang bánh nhé', source_lang: 'vi', target_lang: 'en' },
      },
    ]);
  });

  it('keeps the line as said when a translation fails, and translates nothing for silence', async () => {
    const failing = new ScriptedAi().hears('See you Saturday', 'en');
    expect(await hear(failing, ['vi'])).toEqual({
      said: 'en',
      text: 'See you Saturday',
      translations: {},
    });
    const quiet = new ScriptedAi().hears('', 'en');
    expect((await hear(quiet, ['vi'])).translations).toEqual({});
    expect(quiet.of(TRANSLATION_MODEL)).toEqual([]);
  });
});
