import { describe, expect, it } from 'vitest';

import type { WeekFacts } from './letter';
import { checkLetter } from './letter-rules';

/* What a Sunday letter must keep to before it is kept. Plain checks: no runtime needed. */

const facts: WeekFacts = {
  farmName: 'The Thursday Lot',
  people: [{ person: 'p', name: 'Pip', tag: '{p1}', care: ['messages'] }],
  messages: [
    { tag: '{p1}', text: 'Shall we have a picnic by the river this weekend?' },
    { tag: '{p1}', text: 'Tomatoes are red' },
  ],
  names: ['Pip', 'Fig Newton', 'Bea'],
};

const letter = (title: string, body: string, lang: 'en' | 'vi' = 'en', on = facts) =>
  checkLetter(JSON.stringify({ title, body }), on, lang);

describe('the letter’s house rules', () => {
  it('keeps a warm letter and fills in the names', () => {
    expect(letter('A week on {farm}', '{p1} dreamed up an outing.')).toEqual({
      lang: 'en',
      title: 'A week on The Thursday Lot',
      body: 'Pip dreamed up an outing.',
    });
    expect(letter('Một tuần ấm áp ở {farm}', '{p1} rủ mọi người đi dã ngoại.', 'vi')).toBeNull();
    expect(letter('Tuần ấm áp ở {farm}', '{p1} rủ mọi người đi dã ngoại.', 'vi')).toEqual({
      lang: 'vi',
      title: 'Tuần ấm áp ở The Thursday Lot',
      body: 'Pip rủ mọi người đi dã ngoại.',
    });
  });

  it('says "the farm" for a farm with no name', () => {
    const unnamed = { ...facts, farmName: null };
    expect(letter('A week on {farm}', '{p1} came by.', 'en', unnamed)?.title).toBe(
      'A week on the farm',
    );
    expect(letter('Tuần ấm áp ở {farm}', '{p1} ghé qua.', 'vi', unnamed)?.title).toBe(
      'Tuần ấm áp ở nông trại',
    );
  });

  it('refuses numerals, counting and ranking', () => {
    expect(letter('A week on {farm}', '{p1} tended 3 plants.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} tended ٣ plants.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} tended ½ the field.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} was the top gardener.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} was the first to water.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} gave the best dewdrops.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} and one friend came.')).toBeNull();
    expect(letter('A week on {farm}', 'They both came by.')).toBeNull();
    expect(letter('Tuần ở {farm}', '{p1} gửi hai lần giọt sương.', 'vi')).toBeNull();
    expect(letter('Tuần ở {farm}', '{p1} chăm nhất.', 'vi')).toBeNull();
    expect(letter('Tuần ở {farm}', '{p1} là người đầu tiên tưới cây.', 'vi')).toBeNull();
  });

  it('refuses streaks and every-day talk', () => {
    expect(letter('A week on {farm}', '{p1} kept a streak going.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} watered in a row all week.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} came on consecutive mornings.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} came by every day.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} came by daily.')).toBeNull();
    expect(letter('Tuần ở {farm}', '{p1} ghé thăm liên tiếp.', 'vi')).toBeNull();
    expect(letter('Tuần ở {farm}', '{p1} tưới cây liên tục.', 'vi')).toBeNull();
    expect(letter('Tuần ở {farm}', '{p1} ghé qua mỗi ngày.', 'vi')).toBeNull();
    expect(letter('Tuần ở {farm}', '{p1} ghé qua hằng ngày.', 'vi')).toBeNull();
  });

  it('refuses anyone’s real name outside a placeholder, whoever they are', () => {
    // Pip said yes: still only through {p1}. Fig said no, Bea left: never at all.
    expect(letter('A week on {farm}', 'Pip planned an outing.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} planned an outing with Fig Newton.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} missed bea.')).toBeNull();
    // A name inside another word is not a name.
    expect(letter('A week on {farm}', '{p1} found a beautiful bloom.')?.body).toBe(
      'Pip found a beautiful bloom.',
    );
  });

  it('refuses a run of words lifted from a message, however short the message', () => {
    expect(
      letter('A week on {farm}', '{p1} asked: a picnic by the river this weekend?'),
    ).toBeNull();
    expect(letter('A week on {farm}', '{p1} said tomatoes are red.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} said TOMATOES, are red!')).toBeNull();
  });

  it('refuses a placeholder it wasn’t given, and anything that isn’t the JSON asked for', () => {
    expect(letter('A week on {farm}', '{p2} came too.')).toBeNull();
    expect(checkLetter('Sure! ```json\n{"title": "x"}```', facts, 'en')).toBeNull();
    expect(
      checkLetter(
        '```json\n{\n  "title": "A week on {farm}",\n  "body": "{p1} came."\n}\n```',
        facts,
        'en',
      ),
    ).toEqual({ lang: 'en', title: 'A week on The Thursday Lot', body: 'Pip came.' });
  });
});
