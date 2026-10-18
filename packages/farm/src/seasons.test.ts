import { describe, expect, it } from 'vitest';

import { DAY, MINUTE, T0, bea, expectSnapshot, fig, newFarm, pip, plantOf } from './farm.test-data';
import { hashUnit, rareRoll, signatureFor } from './hash';
import { RARE_CHANCE, RARE_CHANCE_SHARED_RAIN } from './rules';
import { farmChores, nextChoreAt, pendingSeason } from './seasons';
import {
  UnknownTimeZoneError,
  harvestDay,
  isKnownTimeZone,
  localDay,
  seasonDays,
  seasonOf,
  startOfDay,
} from './time';
import { farmView } from './view';

/** Brings the farm's Dew plant (marigold in autumn) to bloom over five days. */
const bloomMarigold = () => {
  const log = newFarm();
  for (let day = 0; day < 5; day++) {
    for (const person of [bea, pip, fig]) log.add('dewdrop', person, {});
    log.wait(DAY);
  }
  return log;
};

describe('Seasons, weather and chance', () => {
  it('names meteorological seasons by hemisphere: north Mar/Jun/Sep/Dec, south Sep/Dec/Mar/Jun', () => {
    const months = (h: 'north' | 'south') =>
      Array.from(
        { length: 12 },
        (_, i) => seasonOf(`2026-${String(i + 1).padStart(2, '0')}-15`, h).season,
      );
    const north = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer'];
    expect(months('north')).toEqual([...north, 'autumn', 'autumn', 'autumn', 'winter']);
    expect(months('south')).toEqual([
      ...['summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter', 'winter', 'winter'],
      ...['spring', 'spring', 'spring', 'summer'],
    ]);
    // A season's year is the year it starts in.
    expect(seasonOf('2027-01-10', 'north')).toEqual({ season: 'winter', year: 2026 });
    expect(seasonOf('2027-02-10', 'south')).toEqual({ season: 'summer', year: 2026 });
    expect(seasonDays({ season: 'winter', year: 2026 }, 'north')).toEqual({
      first: '2026-12-01',
      last: '2027-02-28',
    });
  });

  it('takes days and the starting season from the farm time zone and hemisphere', () => {
    expect(localDay(Date.UTC(2026, 9, 18, 23, 30), 'Europe/London')).toBe('2026-10-19');
    expect(localDay(Date.UTC(2026, 9, 18, 16, 30), 'Asia/Ho_Chi_Minh')).toBe('2026-10-18');
    expect(localDay(Date.UTC(2026, 9, 18, 17, 30), 'Asia/Ho_Chi_Minh')).toBe('2026-10-19');
    expect(newFarm({ hemisphere: 'south' }).state().season).toEqual({
      season: 'spring',
      year: 2026,
    });
    const late = newFarm({ timeZone: 'Asia/Ho_Chi_Minh', start: Date.UTC(2026, 10, 30, 18) });
    expect(late.state().season).toEqual({ season: 'winter', year: 2026 });
  });

  it('makes harvest day the last Sunday of the season, in farm time', () => {
    expect(harvestDay({ season: 'spring', year: 2026 }, 'north')).toBe('2026-05-31');
    expect(harvestDay({ season: 'summer', year: 2026 }, 'north')).toBe('2026-08-30');
    expect(harvestDay({ season: 'autumn', year: 2026 }, 'north')).toBe('2026-11-29');
    expect(harvestDay({ season: 'winter', year: 2026 }, 'north')).toBe('2027-02-28');
    expect(harvestDay({ season: 'spring', year: 2026 }, 'south')).toBe('2026-11-29');
    const log = newFarm();
    expect(farmView(log.state(), T0).harvestDay).toBe('2026-11-29');
    expect(farmChores(log.state(), Date.UTC(2026, 10, 28, 12)).harvest).toBeNull();
    expect(farmChores(log.state(), Date.UTC(2026, 10, 29, 12)).harvest).toEqual({
      season: 'autumn',
      year: 2026,
      day: '2026-11-29',
    });
  });

  it('rolls the season from the calendar until season_rolled lands, then from the log', () => {
    const log = newFarm();
    const december = Date.UTC(2026, 11, 1, 9);
    expect(farmChores(log.state(), december).roll).toEqual({ season: 'winter', year: 2026 });
    // The view keeps the farm's own season, matching its plants, until the roll is written.
    expect(farmView(log.state(), december)).toMatchObject({
      season: { season: 'autumn', year: 2026 },
      rollPending: true,
    });
    expect(log.state().plants[0]?.plant).toBe('marigold');
    log.add('harvested', null, { season: 'autumn', year: 2026, day: '2026-12-01' });
    log.add('season_rolled', null, { season: 'winter', year: 2026 });
    expect(farmChores(log.state(), december)).toMatchObject({ harvest: null, roll: null });
    expect(log.state().plants[0]?.plant).toBe('snowdrop');
    expect(log.state().members.every((m) => !m.activeThisSeason)).toBe(true);
    expect(farmView(log.state(), december)).toMatchObject({ rollPending: false });
  });

  it('keeps the snapshot valid when a big farm rolls its season and keeps tending that day', () => {
    const people = Array.from({ length: 15 }, (_, i) => `p_m${i}`);
    const log = newFarm({ members: people });
    const kinds = ['dewdrop', 'message', 'sticker', 'voice', 'wave', 'seed_planted'] as const;
    const payloads = {
      dewdrop: {},
      message: { text: 'hi' },
      sticker: { pack: 'mine', sticker: 'wave' },
      voice: {
        audio: {
          key: 'farm/f_thursday_lot/0192f1e2-3b4c-7d5e-8f60-123456789abc',
          mime: 'audio/aac',
          bytes: 9,
        },
        durationMs: 900,
        waveform: [],
      },
      wave: {},
      seed_planted: { title: 'Plan', days: [], place: null, yeses: 'couple', someday: false },
    };
    const tendAll = () => {
      for (const person of people) for (const kind of kinds) log.add(kind, person, payloads[kind]);
    };
    tendAll();
    expect(log.state().today.given).toHaveLength(15 * 7);
    log.add('season_rolled', null, { season: 'winter', year: 2026 });
    expect(log.state().today.given.map((g) => g.plant)).toEqual(Array(15).fill('lemon'));
    tendAll();
    expect(log.state().today.given).toHaveLength(15 * 7);
    expect(plantOf(log.state(), 'lemon').dew).toBe(0);
    expectSnapshot(log.state());
  });

  it('wakes the farm object at the next harvest day or season, in farm time', () => {
    const log = newFarm();
    expect(nextChoreAt(log.state(), T0)).toBe(Date.UTC(2026, 10, 29, 0));
    log.add('harvested', null, { season: 'autumn', year: 2026, day: '2026-11-29' });
    expect(nextChoreAt(log.state(), T0)).toBe(Date.UTC(2026, 11, 1, 0));
    expect(nextChoreAt(log.state(), Date.UTC(2026, 11, 1, 3))).toBe(Date.UTC(2026, 11, 1, 3));
    const hanoi = newFarm({ timeZone: 'Asia/Ho_Chi_Minh' }).state();
    expect(nextChoreAt(hanoi, T0)).toBe(Date.UTC(2026, 10, 28, 17));
    expect(startOfDay('2026-03-29', 'Europe/London')).toBe(Date.UTC(2026, 2, 29, 0));
    expect(startOfDay('2026-07-01', 'Europe/London')).toBe(Date.UTC(2026, 5, 30, 23));
  });

  it('never guesses an unknown time zone: it says so instead', () => {
    expect(() => localDay(T0, 'Mars/Olympus_Mons')).toThrow(UnknownTimeZoneError);
    expect(isKnownTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isKnownTimeZone('Asia/Ho_Chi_Minh')).toBe(true);
    const state = { ...newFarm().state(), timeZone: 'Mars/Olympus_Mons' };
    expect(farmView(state, T0 + DAY)).toMatchObject({ timeZoneUnknown: true, today: '2026-10-19' });
    expect(farmView(newFarm().state(), T0).timeZoneUnknown).toBe(false);
  });

  it('applies a new hemisphere from the next season_rolled', () => {
    const log = newFarm();
    log.add('settings_changed', bea, {
      setting: 'calendar',
      timeZone: 'Australia/Sydney',
      hemisphere: 'south',
    });
    const state = log.state();
    expect(state.season).toEqual({ season: 'autumn', year: 2026 });
    expect(pendingSeason(state, '2026-11-30')).toBeNull();
    expect(pendingSeason(state, '2026-12-01')).toEqual({ season: 'summer', year: 2026 });
    expect(farmView(state, T0).harvestDay).toBe('2026-11-29');
  });

  it('rolls once per plant per season, on the first weather day on or after bloom', () => {
    const log = bloomMarigold();
    const farmId = log.state().farm;
    const bloomDay = localDay(plantOf(log.state(), 'marigold').bloomedAt ?? 0, 'Europe/London');
    // A dry day with no shared rain is no roll.
    log.add('weather', null, {
      day: localDay(log.at, 'Europe/London'),
      weather: 'none',
      source: 'weatherkit',
    });
    expect(plantOf(log.state(), 'marigold').rareRolledOn).toBeNull();
    log.wait(DAY);
    const day = localDay(log.at, 'Europe/London');
    expect(day > bloomDay).toBe(true);
    log.add('weather', null, { day, weather: 'frost', source: 'weatherkit' });
    const rolled = plantOf(log.state(), 'marigold');
    expect(rolled.rareRolledOn).toBe(day);
    const rare = rareRoll(farmId, 'marigold', day, 'frost') < RARE_CHANCE;
    expect(rolled.rare).toBe(rare ? 'frost_lace' : null);
    // After that day the variant is fixed for the season, whatever the weather.
    for (let i = 0; i < 20; i++) {
      log.wait(DAY);
      const later = localDay(log.at, 'Europe/London');
      log.add('weather', null, { day: later, weather: 'rain', source: 'weatherkit' });
      log.add('shared_rain', null, { day: later, people: [bea, pip, fig] });
    }
    expect(plantOf(log.state(), 'marigold')).toMatchObject({
      rare: rolled.rare,
      rareRolledOn: day,
    });
    expect(
      log.state().fieldGuide.filter((p) => p.plant === 'marigold' && p.variant !== null),
    ).toHaveLength(rare ? 1 : 0);
  });

  it('lets shared rain later the same day roll again at 0.40, counting as rain on a dry day', () => {
    // Find a day whose plain roll misses but whose shared-rain roll would hit.
    const log = bloomMarigold();
    const farmId = log.state().farm;
    let day = localDay(log.at, 'Europe/London');
    while (!(
      rareRoll(farmId, 'marigold', day, 'heat') >= RARE_CHANCE &&
      rareRoll(farmId, 'marigold', day, 'heat') < RARE_CHANCE_SHARED_RAIN
    )) {
      log.wait(DAY);
      day = localDay(log.at, 'Europe/London');
    }
    log.add('weather', null, { day, weather: 'heat', source: 'weatherkit' });
    expect(plantOf(log.state(), 'marigold')).toMatchObject({ rare: null, rareRolledOn: day });
    log.add('shared_rain', null, { day, people: [bea, pip, fig] });
    expect(plantOf(log.state(), 'marigold').rare).toBe('sun_gold');
    // On a dry day, shared rain alone rolls as rain.
    const dry = bloomMarigold();
    const dryDay = localDay(dry.at, 'Europe/London');
    dry.add('shared_rain', null, { day: dryDay, people: [bea, pip, fig] });
    const expected = rareRoll(farmId, 'marigold', dryDay, 'rain') < RARE_CHANCE_SHARED_RAIN;
    expect(plantOf(dry.state(), 'marigold')).toMatchObject({
      rare: expected ? 'rain_kissed' : null,
      rareRolledOn: dryDay,
    });
  });

  it('never rerolls: the same facts give the same number, on every device', () => {
    // Pinned: a change to the hash changes outcomes, so it needs a rules-version bump.
    expect(hashUnit('a')).toBe(0.10352621669881046);
    expect(rareRoll('f_thursday_lot', 'marigold', '2026-10-18', 'rain')).toBe(0.5087160784751177);
    expect(signatureFor('f_thursday_lot')).toBe('lemon');
    const rolls = Array.from({ length: 20_000 }, (_, i) => hashUnit('f', String(i)));
    const under = rolls.filter((r) => r < RARE_CHANCE).length / rolls.length;
    expect(under).toBeGreaterThan(0.14);
    expect(under).toBeLessThan(0.16);
  });

  it('writes shared rain when three members open the farm within ten minutes, once a day', () => {
    // Moving in doesn't count as opening the farm.
    const log = newFarm();
    expect(farmChores(log.state(), log.at).sharedRain).toBeNull();
    log.wait(DAY).add('farm_opened', bea, {});
    log.wait(4 * MINUTE).add('farm_opened', pip, {});
    expect(farmChores(log.state(), log.at).sharedRain).toBeNull();
    log.wait(4 * MINUTE).add('farm_opened', fig, {});
    const due = farmChores(log.state(), log.at).sharedRain;
    expect(due).toEqual({ day: '2026-10-19', people: [bea, pip, fig] });
    log.add('shared_rain', null, due);
    expect(farmChores(log.state(), log.at).sharedRain).toBeNull();
  });
});
