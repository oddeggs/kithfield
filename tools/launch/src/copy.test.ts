import { type Language, type StringKey, t as translate } from '@kithfield/i18n';
import { describe, expect, it } from 'vitest';

import { APP_WORDS, LAUNCH_WORDS, rewritesFor, stillEnglish } from './copy';

/** Every key here takes no parameters. */
const t = translate as (language: Language, key: StringKey) => string;

const fromBoard = {
  'Stay close. No texting guilt.': {
    texts: ['Vẫn thân, chẳng cần nhắn hoài.'],
    font: { family: 'Lora', weight: '600', sizeRatio: 20 / 22, lineRatio: null },
  },
  'Seed bed': {
    texts: ['Vườn hạt'],
    font: { family: '-apple-system', weight: '600', sizeRatio: 1, lineRatio: null },
  },
};

describe('rewriting board copy', () => {
  it('keeps English board copy, except UI words the app says differently', () => {
    const { rewrites, swaps } = rewritesFor('en', fromBoard);
    expect(rewrites['Stay close. No texting guilt.']).toBeUndefined();
    expect(rewrites['Chat']).toEqual({ texts: [t('en', 'shell.tab.chat')] });
    expect(rewrites['Farm']).toBeUndefined();
    expect(swaps).toEqual([]);
  });

  it('takes the board’s own Vietnamese, with its type', () => {
    const { rewrites } = rewritesFor('vi', fromBoard);
    expect(rewrites['Stay close. No texting guilt.']).toEqual(
      fromBoard['Stay close. No texting guilt.'],
    );
  });

  it('puts the app’s own words over the board’s, keeping the board’s type', () => {
    const { rewrites } = rewritesFor('vi', fromBoard);
    expect(rewrites['Seed bed']).toEqual({
      texts: [t('vi', 'shell.tab.seedBed')],
      font: fromBoard['Seed bed'].font,
    });
  });

  it('fills the copy the board has only in English from the launch catalogue, in the Vietnamese type', () => {
    const { rewrites, swaps } = rewritesFor('vi', fromBoard);
    for (const key of LAUNCH_WORDS) {
      expect(rewrites[t('en', key)]?.texts).toEqual([t('vi', key)]);
    }
    expect(swaps.map((s) => s.from)).toEqual(['Young Serif', 'Gaegu']);
  });

  it('knows every app word in both languages', () => {
    for (const key of Object.values(APP_WORDS)) {
      expect(t('vi', key)).not.toBe(t('en', key));
    }
  });

  it('lets names and a home screen’s system labels stay in English', () => {
    expect(stillEnglish(['Kithfield', 'Photos', 'Book club', 'Book club'])).toEqual(['Book club']);
  });
});
