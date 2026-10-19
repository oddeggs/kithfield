import { describe, expect, it } from 'vitest';

import * as ai from './http/ai';
import * as fire from './http/fire';
import * as rhythm from './http/rhythm';
import * as stickers from './http/stickers';
import { at, bea, eventPayloads, farm, fig, opId, pip } from './samples.test-data';
import { describeSchemas } from './schema-runner.test-data';

const message = {
  seq: 41,
  opId,
  at,
  day: '2026-10-18',
  actor: bea,
  rulesVersion: 3,
  kind: 'message',
  payload: eventPayloads.message,
};
const page = {
  seq: 88,
  at,
  actor: bea,
  title: 'Picnic by the river',
  seed: 20,
  flower: 'cosmos',
  items: [message, { ...message, seq: 42, payload: { tombstone: 'unsent' } }],
};
const recap = {
  farm,
  week: '2026-10-18',
  pollinator: { person: pip, reason: 'checked_on_everyone' },
  thanks: [
    { person: pip, kinds: ['wave', 'firefly'] },
    { person: 'p_otis', kinds: ['dewdrop'] },
  ],
  plans: [20],
  letterState: 'written',
  letter: {
    lang: 'en',
    title: 'A good week on the Thursday Lot',
    body: 'A picnic planned, a pile of allotment photos, and Otis came back from his nap.',
  },
};
const attribution = {
  source: 'weatherkit',
  serviceName: 'Apple Weather',
  markLight: 'https://weatherkit.apple.com/assets/branding/en/Apple_Weather_blk_en_3X.png',
  markDark: 'https://weatherkit.apple.com/assets/branding/en/Apple_Weather_wht_en_3X.png',
  legalUrl: 'https://developer.apple.com/weatherkit/data-source-attribution/',
};
const line = {
  speaker: bea,
  chunk: 4,
  said: 'vi',
  text: 'Mình nhớ mọi người lắm, tuần này dài quá.',
  translation: { lang: 'en', text: 'I missed you all so much, this week was so long.' },
};

const samples: Record<string, [valid: unknown[], invalid: unknown[]]> = {
  FireRoom: [['fire-f_thursday_lot'], ['f_thursday_lot', 'fire-', 'fire-a b']],
  LanguageTag: [
    ['en', 'vi', 'fil'],
    ['EN', 'en-GB', ''],
  ],
  FireAttributes: [
    [
      { mode: 'join', captionsOk: 'yes', lantern: 'off' },
      { mode: 'listen', captionsOk: 'no', captionsIn: 'en', lantern: 'off' },
    ],
    [
      { mode: 'speak', captionsOk: 'yes', lantern: 'off' },
      { mode: 'join', captionsOk: true, lantern: 'off' },
      { mode: 'join', captionsOk: 'yes' },
    ],
  ],
  FireCaptionChunkResponse: [[{ listening: true }, { listening: false }], [{}]],
  FireCaptionLine: [
    [line, { ...line, said: 'en', translation: null }],
    [
      { ...line, text: '' },
      { ...line, speaker: null },
      { ...line, chunk: -1 },
    ],
  ],
  ScrapbookPage: [
    [page, { ...page, seed: null, flower: null, items: [] }],
    [
      { ...page, title: '' },
      { ...page, items: [{ ...message, seq: 0 }] },
    ],
  ],
  ScrapbookList: [
    [
      { pages: [page], more: true },
      { pages: [], more: false },
    ],
    [{ pages: [page] }],
  ],
  PollinatorReason: [
    ['checked_on_everyone', 'a_new_reason'],
    ['Most messages!', ''],
  ],
  RecapQuery: [[{ week: '2026-10-18' }, {}], [{ week: 'last sunday' }]],
  WeeklyRecap: [
    [
      recap,
      { ...recap, pollinator: null, thanks: [], plans: [], letterState: 'none', letter: null },
      { ...recap, letterState: 'writing', letter: null },
      { ...recap, pollinator: { person: pip, reason: 'a_reason_from_later' } },
    ],
    [
      { ...recap, letter: null },
      { ...recap, letterState: 'none' },
      { ...recap, thanks: [{ person: pip, kinds: ['wave', 'wave'] }] },
      { ...recap, letter: { ...recap.letter, body: 'x'.repeat(1201) } },
    ],
  ],
  WeatherAttributionQuery: [
    [{ source: 'weatherkit', lang: 'vi' }],
    [{ source: 'Weather Kit', lang: 'en' }, { source: 'weatherkit' }],
  ],
  WeatherAttribution: [
    [attribution, { ...attribution, source: 'met_office' }],
    [
      { ...attribution, legalUrl: 'ftp://example.com' },
      { ...attribution, markDark: undefined },
    ],
  ],
  TogetherPeople: [[{ people: [bea, pip] }, { people: [] }], [{ people: ['not a person!'] }]],
  TogetherExportRequest: [
    [{ farm, people: [bea, pip] }],
    [
      { farm, people: [] },
      { farm, people: [bea, pip, fig, 'p_otis', 'p_mo'] },
    ],
  ],
  TogetherExportConsents: [[{ ok: [bea] }, { ok: [] }], [{ ok: null }]],
  TogetherAskList: [
    [
      {
        asks: [
          { from: pip, farm, at, ok: null },
          { from: fig, farm, at, ok: true },
        ],
      },
    ],
    [{ asks: [{ from: pip, farm, at }] }],
  ],
  TogetherAskAnswer: [[{ ok: true }, { ok: false }], [{ ok: 'maybe' }]],
  VoiceCaptionRequest: [[{ lang: 'en' }], [{ lang: 'fr' }, {}]],
  VoiceCaption: [
    [
      {
        state: 'ready',
        seq: 51,
        said: 'vi',
        text: 'Thứ bảy mình mang bánh nhé',
        translation: null,
      },
      {
        state: 'ready',
        seq: 51,
        said: 'vi',
        text: 'Thứ bảy mình mang bánh nhé',
        translation: { lang: 'en', text: "I'll bring the cakes on Saturday" },
      },
      { state: 'pending', seq: 51 },
      { state: 'not_allowed', seq: 51 },
      { state: 'failed', seq: 51 },
    ],
    [
      { state: 'ready', seq: 51, said: 'vi', text: '', translation: null },
      { state: 'transcribing', seq: 51 },
      { state: 'pending' },
    ],
  ],
};

describeSchemas(
  'HTTP bodies for the fire, rhythm, stickers and AI',
  { ...fire, ...rhythm, ...stickers, ...ai },
  samples,
  ['FireCaptionChunkQuery', 'ScrapbookQuery'],
);

describe('depth contracts', () => {
  it('names a farm fire room both ways', () => {
    expect(fire.fireRoomOf(farm)).toBe('fire-f_thursday_lot');
    expect(fire.farmOfFireRoom(fire.fireRoomOf(farm))).toBe(farm);
    expect(fire.farmOfFireRoom('f_thursday_lot')).toBeNull();
  });

  it('reads plain whole numbers from query strings', () => {
    expect(fire.FireCaptionChunkQuery.parse({ chunk: '3', startedAt: String(at) })).toEqual({
      chunk: 3,
      startedAt: at,
    });
    expect(rhythm.ScrapbookQuery.parse({ before: '88' })).toEqual({ before: 88 });
    expect(rhythm.ScrapbookQuery.parse({})).toEqual({});
    for (const bad of [{ chunk: '1e3', startedAt: '0' }, { chunk: '-1', startedAt: '0' }, {}]) {
      expect(fire.FireCaptionChunkQuery.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(rhythm.ScrapbookQuery.safeParse({ before: '0' }).success).toBe(false);
  });

  it('keeps counts out of the recap, the captions and the sticker asks', () => {
    for (const schema of [
      rhythm.WeeklyRecap,
      fire.FireCaptionLine,
      ai.VoiceCaption,
      stickers.TogetherExportConsents,
      stickers.TogetherAskList,
    ]) {
      expect(JSON.stringify(schema.toJSONSchema())).not.toMatch(
        /"(count|total|tally|streak|readAt|seenAt|seenBy|score|rank)"/i,
      );
    }
    expect(rhythm.KNOWN_POLLINATOR_REASONS.every((r) => !/most|count/.test(r))).toBe(true);
  });

  it('knows its own sticker pack first', () => {
    expect(stickers.KNOWN_STICKER_PACKS[0]).toBe(stickers.OWN_PACK);
    expect(eventPayloads.sticker).toMatchObject({ pack: stickers.OWN_PACK });
  });
});
