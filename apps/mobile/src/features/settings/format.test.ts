import { describe, expect, it } from '@jest/globals';

import {
  agoOf,
  castOf,
  clockTime,
  dayIn,
  desktopCodeOf,
  hemisphereOfZone,
  isOwnLink,
  linkExpiry,
  lookOf,
  muteChoiceOf,
  muteUntil,
  notifySummary,
  sameHours,
  seasonHere,
  shortLink,
  zoneName,
} from './format';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const critter = {
  species: 'rabbit',
  coat: 'cocoa',
  mark: null,
  accessory: null,
  outfit: 'scarf',
  outfitColor: '#5e7f4a',
  companion: null,
  cottage: null,
} as const;
const knockFor = { plans: true, doorstep: true, mentions: true, messages: false };

describe('drawing a critter', () => {
  it('passes only the layers it has to the art', () => {
    expect(lookOf(critter)).toEqual({ coat: 'cocoa', outfit: { name: 'scarf', color: '#5e7f4a' } });
    expect(castOf(critter, 'z')).toBe('rabbit/cocoa//scarf/#5e7f4a/z');
  });
});

describe('the seasons on your own screens', () => {
  it('reads the half of the world from the time zone', () => {
    expect(hemisphereOfZone('Europe/London')).toBe('north');
    expect(hemisphereOfZone('Asia/Ho_Chi_Minh')).toBe('north');
    expect(hemisphereOfZone('Australia/Sydney')).toBe('south');
    expect(hemisphereOfZone('Pacific/Auckland')).toBe('south');
    expect(hemisphereOfZone('America/Argentina/Buenos_Aires')).toBe('south');
    expect(hemisphereOfZone('UTC')).toBe('north');
  });

  it('counts the day where the phone is, not in UTC', () => {
    const lateInLondon = Date.UTC(2026, 9, 18, 23, 30);
    expect(dayIn('Europe/London', lateInLondon)).toBe('2026-10-19');
    expect(dayIn('America/New_York', lateInLondon)).toBe('2026-10-18');
  });

  it('turns autumn in the north into spring in the south', () => {
    const october = Date.UTC(2026, 9, 18, 12);
    expect(seasonHere('Europe/London', october)).toBe('autumn');
    expect(seasonHere('Australia/Sydney', october)).toBe('spring');
  });
});

describe('quiet hours', () => {
  it('reads times as each language does', () => {
    expect(clockTime('21:00', 'en')).toBe('9pm');
    expect(clockTime('08:30', 'en')).toBe('8:30am');
    expect(clockTime('00:00', 'en')).toBe('12am');
    expect(clockTime('21:00', 'vi')).toBe('21:00');
  });

  it('compares hours, with only the house hours as null', () => {
    expect(sameHours(null, null)).toBe(true);
    expect(sameHours({ from: '21:00', to: '08:00' }, null)).toBe(false);
    expect(sameHours({ from: '21:00', to: '08:00' }, { from: '21:00', to: '08:00' })).toBe(true);
  });

  it('names a zone by its town', () => {
    expect(zoneName('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneName('UTC')).toBe('UTC');
  });
});

describe('when a device was last about', () => {
  const now = Date.UTC(2026, 9, 18, 12);
  it('says now, today, days or months, never a count of anything else', () => {
    expect(agoOf(now - 60_000, now)).toEqual({ kind: 'now' });
    expect(agoOf(now - 3 * HOUR, now)).toEqual({ kind: 'today' });
    expect(agoOf(now - 3 * DAY, now)).toEqual({ kind: 'days', count: 3 });
    expect(agoOf(now - 120 * DAY, now)).toEqual({ kind: 'months', count: 4 });
  });
});

describe('muting a farm', () => {
  const now = new Date(2026, 9, 18, 15, 0).getTime();
  it('ends each mute where its row says', () => {
    expect(muteUntil('hour', now)).toBe(now + HOUR);
    expect(muteUntil('morning', now)).toBe(new Date(2026, 9, 19, 8, 0).getTime());
    expect(muteUntil('week', now)).toBe(now + 7 * DAY);
    expect(muteUntil('always', now)).toBe('always');
  });

  it('reads a mute back as the row that was picked', () => {
    for (const choice of ['hour', 'morning', 'week', 'always'] as const) {
      expect(muteChoiceOf(muteUntil(choice, now), now + 60_000)).toBe(choice);
    }
    expect(muteChoiceOf(null, now)).toBeNull();
    expect(muteChoiceOf(now - 1, now)).toBeNull();
  });

  it('sums a farm up as muted, every message or gentle', () => {
    expect(notifySummary({ mutedUntil: 'always', knockFor }, now)).toBe('muted');
    expect(
      notifySummary({ mutedUntil: null, knockFor: { ...knockFor, messages: true } }, now),
    ).toBe('every');
    expect(notifySummary({ mutedUntil: now - 1, knockFor }, now)).toBe('gentle');
  });
});

describe('invite links', () => {
  it('lasts as long as was chosen, or always', () => {
    expect(linkExpiry('always', 0)).toBeNull();
    expect(linkExpiry('day', 0)).toBe(DAY);
    expect(linkExpiry('week', 0)).toBe(7 * DAY);
    expect(linkExpiry('month', 0)).toBe(30 * DAY);
  });

  it('shows a link without its scheme', () => {
    expect(shortLink('https://kith.fm/thursday-lot/')).toBe('kith.fm/thursday-lot');
  });
});

describe('the computer sign-in code', () => {
  const code = 'Ab3_dE5-fG7hJ9kL';
  it('reads the code only from a Kithfield desktop link', () => {
    expect(desktopCodeOf(`https://kithfield.com/desktop#${code}`)).toBe(code);
    expect(desktopCodeOf(`https://dev.kithfield.com/desktop#${code}`)).toBe(code);
  });

  it('ignores codes on their own, on other hosts or paths, and anything else', () => {
    expect(desktopCodeOf(code)).toBeNull();
    expect(desktopCodeOf(`https://kith.fm/desktop#${code}`)).toBeNull();
    expect(desktopCodeOf(`https://kithfield.com.evil.example/desktop#${code}`)).toBeNull();
    expect(desktopCodeOf(`http://kithfield.com/desktop#${code}`)).toBeNull();
    expect(desktopCodeOf(`https://kithfield.com/invite#${code}`)).toBeNull();
    expect(desktopCodeOf(`https://kithfield.com/desktop?code=${code}`)).toBeNull();
    expect(desktopCodeOf('https://kithfield.com/desktop#short')).toBeNull();
    expect(desktopCodeOf('')).toBeNull();
  });
});

describe('the keepsakes download', () => {
  it('opens only a link on the API’s own host', () => {
    const api = 'https://dev.kithfield.com/api';
    expect(isOwnLink('https://dev.kithfield.com/api/v1/me/export/x/download?sig=1', api)).toBe(
      true,
    );
    expect(isOwnLink('https://evil.example/x.zip', api)).toBe(false);
    expect(isOwnLink('http://dev.kithfield.com/api/x', api)).toBe(false);
    expect(isOwnLink('not a url', api)).toBe(false);
    expect(isOwnLink('http://localhost:8856/api/v1/x', 'http://localhost:8856/api')).toBe(true);
  });
});
