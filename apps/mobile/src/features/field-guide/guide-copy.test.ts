import { describe, expect, it } from '@jest/globals';
import { translator } from '@kithfield/i18n';

import {
  aroundBold,
  cropName,
  dateOf,
  farmWord,
  familyLine,
  plantTitle,
  plantWord,
  seasonRange,
  signatureName,
  variantOf,
} from './guide-copy';

const en = translator('en');
const vi = translator('vi');
const lot = { name: 'The Thursday Lot', signature: 'plum', timeZone: 'Europe/London' };

describe('plant names', () => {
  it('titles a plant and keeps it lower case mid-sentence', () => {
    expect(plantTitle(en, 'en', lot, 'lavender')).toBe('Lavender');
    expect(plantWord(en, 'en', lot, 'lavender')).toBe('lavender');
    expect(plantWord(en, 'en', lot, 'hellebore')).toBe('Christmas rose');
    expect(plantTitle(en, 'en', lot, 'forgetmenot')).toBe('Forget-me-not');
  });

  it('lower-cases a Vietnamese name mid-sentence', () => {
    expect(plantTitle(vi, 'vi', lot, 'lavender')).toBe('Oải hương');
    expect(plantWord(vi, 'vi', lot, 'lavender')).toBe('oải hương');
  });

  it('names the signature crop after the farm', () => {
    expect(farmWord('en', 'The Thursday Lot')).toBe('Thursday');
    expect(farmWord('en', 'Pancakes')).toBe('Pancakes');
    expect(signatureName(en, 'en', 'The Thursday Lot', 'plum')).toBe('Thursday plum');
    expect(plantTitle(en, 'en', lot, 'plum')).toBe('Thursday plum');
    expect(cropName(en, 'en', lot, { plant: 'plum', variant: null })).toBe('Thursday plums');
    expect(signatureName(vi, 'vi', 'Hội Thứ Năm', 'plum')).toBe('Mận của Hội Thứ Năm');
  });

  it('names crops as the basket holds them', () => {
    expect(cropName(en, 'en', lot, { plant: 'pumpkin', variant: null })).toBe('Pumpkins');
    expect(cropName(en, 'en', lot, { plant: 'heather', variant: null })).toBe('Heather');
  });

  it('names a rare variant around the plant', () => {
    expect(variantOf(en, 'en', lot, 'rain_kissed', 'sunflower')).toBe('rain-kissed sunflower');
    expect(variantOf(vi, 'vi', lot, 'rain_kissed', 'sunflower')).toBe('hoa hướng dương đẫm mưa');
  });
});

describe('seasons and dates', () => {
  it('gives a season’s months by hemisphere', () => {
    expect(seasonRange(en, 'autumn', 'north', true)).toBe('Autumn · Sep–Nov · now');
    expect(seasonRange(en, 'autumn', 'south', false)).toBe('Autumn · Mar–May');
    expect(seasonRange(en, 'winter', 'north', false)).toBe('Winter · Dec–Feb');
  });

  it('dates in the farm’s calendar', () => {
    expect(dateOf(en, lot, Date.UTC(2026, 4, 31, 12))).toBe('31 May');
  });

  it('lines a family with its first kind of care', () => {
    expect(familyLine(en, 'voices')).toBe('Voices · voice notes');
  });
});

describe('a sentence around a bold phrase', () => {
  it('keeps each language’s word order', () => {
    const rare = 'rain-kissed lavender';
    const parts = aroundBold((m) => en('fieldGuide.page.rare.rain_kissed', { rare: m }), rare);
    expect(parts.before).toBe('Rare: ');
    expect(parts.after.startsWith(' appears after shared rain')).toBe(true);
  });
});
