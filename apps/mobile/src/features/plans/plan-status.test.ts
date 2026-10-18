import { describe, expect, it } from '@jest/globals';
import type { SeedState } from '@kithfield/contracts';
import { translator } from '@kithfield/i18n';
import { planConditions } from '@kithfield/farm';

import { canPlant, draftStage, joinNames, placeSuggestions, plantPayload, titleFrom } from './draft';
import {
  bedKindOf,
  leadingOptions,
  planDay,
  sortBed,
  stageOf,
  stillGrowing,
  stillVoting,
  type BedEntry,
} from './plan-status';

const seed = (over: Partial<SeedState> = {}): SeedState => ({
  seq: 10,
  planter: 'pip',
  unsent: false,
  title: 'Picnic by the river',
  days: [],
  place: null,
  yeses: 'couple',
  someday: false,
  hat: 'pip',
  settleOn: null,
  votes: [],
  rsvps: [],
  checkins: [],
  sproutedAt: null,
  ...over,
});

const today = '2026-10-18';
const kind = (s: SeedState, members = 4) => bedKindOf(s, planConditions(s, members), today);

describe('where a plan stands', () => {
  it('grows a stage per condition, and blooms once sprouted', () => {
    const s = seed({ days: [{ date: '2026-10-24' }], place: { name: 'Willow bend' } });
    expect(stageOf(s, planConditions(s, 4))).toBe(2);
    expect(stageOf({ ...s, sproutedAt: 1 }, planConditions(s, 4))).toBe(3);
    expect(stageOf(seed(), planConditions(seed(), 4))).toBe(0);
  });

  it('leans toward the fullest bud, the earliest of a tie', () => {
    const s = seed({
      days: [{ date: '2026-10-24' }, { date: '2026-10-25' }],
      votes: [
        { option: 0, people: ['a'] },
        { option: 1, people: ['b', 'c'] },
      ],
    });
    expect(leadingOptions(s)).toEqual([1]);
    expect(planDay(s)).toBeNull();
    expect(planDay({ ...s, settleOn: '2026-10-22' })).toBe('2026-10-25');
    expect(stillVoting({ ...s, settleOn: '2026-10-22' }, today)).toBe(true);
    expect(stillVoting({ ...s, settleOn: '2026-10-22' }, '2026-10-22')).toBe(false);
    expect(leadingOptions(seed({ days: s.days }))).toEqual([]);
  });

  it('sorts the seed bed: sprouted, growing, picking, needing, then resting', () => {
    const entry = (s: SeedState, k = kind(s)): BedEntry => ({
      farm: 'f',
      farmName: null,
      timeZone: 'Europe/London',
      seed: s,
      stage: 0,
      kind: k,
      day: planDay(s),
      conditions: planConditions(s, 4),
    });
    const someday = entry(seed({ seq: 1, someday: true }));
    const needs = entry(seed({ seq: 2, place: { name: "Mo's" } }));
    const growing = entry(
      seed({ seq: 3, days: [{ date: '2026-11-06' }], place: { name: 'Copper Pot' } }),
    );
    const sprouted = entry(
      seed({ seq: 4, days: [{ date: '2026-10-24' }], place: { name: 'Willow' }, sproutedAt: 5 }),
    );
    const picking = entry(seed({ seq: 5, days: [{ date: '2026-10-24' }, { date: '2026-10-25' }] }));
    expect([someday, needs, growing, sprouted, picking].map((e) => e.kind)).toEqual([
      'someday',
      'needs',
      'growing',
      'sprouted',
      'picking',
    ]);
    expect(sortBed([someday, needs, growing, sprouted, picking]).map((e) => e.seed.seq)).toEqual([
      4, 3, 5, 2, 1,
    ]);
  });

  it('calls a sprouted plan on its day "today"', () => {
    const s = seed({ days: [{ date: today }], place: { name: 'Willow' }, sproutedAt: 1 });
    expect(kind(s)).toBe('today');
  });

  it('lets a plan rest once its day is well past', () => {
    const s = seed({ days: [{ date: '2026-10-16' }] });
    expect(stillGrowing({ seed: s, day: '2026-10-16' }, today)).toBe(false);
    expect(stillGrowing({ seed: s, day: '2026-10-17' }, today)).toBe(true);
    expect(stillGrowing({ seed: seed({ someday: true }), day: null }, today)).toBe(true);
  });
});

describe('a plan being planted', () => {
  const draft = {
    title: '  Picnic by the river ',
    days: ['2026-10-25', '2026-10-24', '2026-10-24'],
    place: ' Willow bend, Hollow Creek ',
    yeses: 'most' as const,
  };

  it('becomes a seed_planted payload', () => {
    expect(plantPayload(draft, { fromSeq: 7 })).toEqual({
      fromSeq: 7,
      title: 'Picnic by the river',
      days: [{ date: '2026-10-24' }, { date: '2026-10-25' }],
      place: { name: 'Willow bend, Hollow Creek' },
      yeses: 'most',
      someday: false,
    });
    expect(plantPayload({ ...draft, place: '  ' }).place).toBeNull();
    expect(canPlant({ ...draft, title: ' ' })).toBe(false);
  });

  it('counts its stage as the farm will', () => {
    expect(draftStage({ ...draft, days: ['2026-10-24'] }, 4, 1)).toBe(2);
    expect(draftStage({ ...draft, days: ['2026-10-24'], yeses: 'couple' }, 4, 2)).toBe(3);
    // Two days to pick between are not a day yet.
    expect(draftStage(draft, 4, 1)).toBe(1);
    expect(draftStage({ ...draft, days: [], place: '' }, 4, 1)).toBe(0);
  });

  it('takes its title from a message, and suggests places used before', () => {
    expect(titleFrom('picnic by the river?\nbring snacks')).toBe('picnic by the river?');
    expect(titleFrom('x'.repeat(100))).toHaveLength(80);
    expect(
      placeSuggestions([
        seed({ seq: 1, place: { name: 'Willow bend' } }),
        seed({ seq: 2, place: { name: "Pip's garden" } }),
        seed({ seq: 3, place: { name: 'Willow bend' } }),
      ]),
    ).toEqual(['Willow bend', "Pip's garden"]);
  });

  it('joins names as a sentence does', () => {
    const en = translator('en');
    expect(joinNames(en, ['Pip', 'you'])).toBe('Pip and you');
    expect(joinNames(en, ['Pip', 'Bea', 'you'])).toBe('Pip, Bea and you');
    expect(joinNames(en, ['you'])).toBe('you');
  });
});
