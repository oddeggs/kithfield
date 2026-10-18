import { describe, expect, it } from 'vitest';

import { findCatalogueProblems, findFeatureProblems } from './completeness';
import { findHouseWordProblems } from './house-words';

describe('findCatalogueProblems', () => {
  it('passes a complete translation', () => {
    expect(
      findCatalogueProblems(
        {
          'a.x': 'Hello {name}',
          'a.y': { one: '{count} critter', other: '{count} critters' },
          'a.z': '{name}: {preview}',
        },
        {
          'a.x': 'Chào {name}',
          'a.y': { other: '{count} bạn thú' },
          'a.z': '{name} nói: {preview}',
        },
      ),
    ).toEqual([]);
  });

  it('flags missing, extra, empty, reshaped and untranslated keys, and changed placeholders', () => {
    expect(
      findCatalogueProblems(
        {
          'a.missing': 'Here',
          'a.empty': 'Full',
          'a.plural': { one: '{count} seed', other: '{count} seeds' },
          'a.params': 'Hi {name}',
          'a.english': 'Seed bed',
        },
        {
          'a.empty': ' ',
          'a.plural': '{count} hạt',
          'a.params': 'Chào {ten}',
          'a.english': 'Seed bed',
          'a.extra': 'Thêm',
        },
      ),
    ).toEqual([
      'a.extra: only in the translation',
      'a.missing: missing from the translation',
      'a.empty: empty translation',
      'a.plural: plural in one language only',
      'a.params: placeholders differ ({name} in English, {ten} here)',
      'a.english: still the English text ("Seed bed")',
    ]);
  });

  it('flags empty English and placeholders that are not plain names', () => {
    expect(
      findCatalogueProblems(
        { 'a.blank': '', 'a.spaced': 'Hi {first name}', 'a.dashed': '{first-name}: {preview}' },
        {
          'a.blank': 'Trống',
          'a.spaced': 'Chào {first name}',
          'a.dashed': 'Chào {first-name}: {preview}',
        },
      ),
    ).toEqual([
      'a.blank: empty in English',
      'a.spaced: placeholder {first name} in English is not a plain name',
      'a.spaced: placeholder {first name} in the translation is not a plain name',
      'a.dashed: placeholder {first-name} in English is not a plain name',
      'a.dashed: placeholder {first-name} in the translation is not a plain name',
    ]);
  });

  it('allows English text only for keys listed as the same in both, and keeps that list honest', () => {
    expect(
      findCatalogueProblems(
        { 'a.brand': 'Kithfield+', 'a.word': 'Farm' },
        { 'a.brand': 'Kithfield+', 'a.word': 'Nông trại' },
        ['a.brand', 'a.word', 'a.gone'],
      ),
    ).toEqual([
      'a.gone: listed as the same in both, but not in English',
      'a.word: listed as the same in both, but the texts differ',
    ]);
  });
});

describe('findFeatureProblems', () => {
  it('names the file and requires the feature prefix on every key', () => {
    expect(
      findFeatureProblems({
        name: 'seedBed',
        file: 'seed-bed',
        en: { 'seedBed.title': 'Seed bed', 'farm.title': 'Farm' },
        vi: { 'seedBed.title': 'Luống hạt', 'farm.title': 'Nông trại' },
        sameInBoth: [],
      }),
    ).toEqual(['seed-bed: farm.title: keys in seed-bed.en.ts start with "seedBed."']);
  });
});

describe('findHouseWordProblems', () => {
  it('flags the words the glossary rules out and counts of care', () => {
    expect(
      findHouseWordProblems({
        'a.ok': 'Mo is dozing. 14 critters live here. No streaks and no read receipts.',
        'a.wave': '{name} waves goodnight',
        'a.servers': 'Plus helps pay for the servers',
        'a.avatar': 'Change your avatar',
        'a.admin': 'Only admins can do this',
        'a.dm': 'Send a DM',
        'a.care': { one: '{count} dewdrop sent', other: '{count} dewdrops sent' },
        'a.streak': '{days} days in a row',
      }),
    ).toEqual([
      'a.avatar: says "avatar"; use critter',
      'a.admin: says "admins"; use keeper',
      'a.dm: says "DM"; use visit',
      'a.care: counts care ("{count} dewdrop")',
      'a.care: counts care ("{count} dewdrops")',
      'a.streak: counts care ("{days} days in a row")',
    ]);
  });
});
