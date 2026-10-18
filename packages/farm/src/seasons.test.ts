import { type Weather } from '@kithfield/contracts';
import { describe, expect, it } from 'vitest';

import { DAY, MINUTE, T0, bea, fig, newFarm, pip, plantOf } from './farm.test-data';
import { hashUnit, rareRoll, signatureFor } from './hash';
import { RARE_CHANCE, RARE_CHANCE_SHARED_RAIN } from './rules';
import { farmChores, pendingSeason } from './seasons';
import { harvestDay, localDay, seasonDays, seasonOf } from './time';
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
    expect(farmView(log.state(), december).season).toEqual({ season: 'winter', year: 2026 });
    expect(log.state().plants[0]?.plant).toBe('marigold');
    log.add('harvested', null, { season: 'autumn', year: 2026, day: '2026-12-01' });
    log.add('season_rolled', null, { season: 'winter', year: 2026 });
    expect(farmChores(log.state(), december)).toMatchObject({ harvest: null, roll: null });
    expect(log.state().plants[0]?.plant).toBe('snowdrop');
    expect(log.state().members.every((m) => !m.activeThisSeason)).toBe(true);
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

  it('turns a blooming plant rare when hash(farm, plant, day, weather) is under 0.15', () => {
    const log = bloomMarigold();
    let turned = 0;
    for (let i = 0; i < 25 && turned === 0; i++) {
      const day = localDay(log.at, 'Europe/London');
      const weather: Weather = (['rain', 'frost', 'heat'] as const)[i % 3] ?? 'rain';
      log.add('weather', null, { day, weather, source: 'weatherkit' });
      const expected = rareRoll(log.state().farm, 'marigold', day, weather) < RARE_CHANCE;
      const rare = plantOf(log.state(), 'marigold').rare;
      expect(rare !== null).toBe(expected);
      if (rare) {
        turned++;
        expect(rare).toBe({ rain: 'rain_kissed', frost: 'frost_lace', heat: 'sun_gold' }[weather]);
        expect(
          log.state().fieldGuide.some((p) => p.plant === 'marigold' && p.variant === rare),
        ).toBe(true);
      }
      log.wait(DAY);
    }
    expect(turned).toBe(1);
  });

  it('raises the chance to 0.40 with shared rain, which counts as rain on a dry day', () => {
    const log = bloomMarigold();
    for (let i = 0; i < 25; i++) {
      const day = localDay(log.at, 'Europe/London');
      const before = plantOf(log.state(), 'marigold').rare;
      log.add('shared_rain', null, { day, people: [bea, pip, fig] });
      const roll = rareRoll(log.state().farm, 'marigold', day, 'rain');
      if (before === null) {
        expect(plantOf(log.state(), 'marigold').rare).toBe(
          roll < RARE_CHANCE_SHARED_RAIN ? 'rain_kissed' : null,
        );
      }
      log.wait(DAY);
    }
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
    const log = newFarm().wait(DAY);
    log.add('farm_opened', bea, {});
    log.wait(4 * MINUTE).add('farm_opened', pip, {});
    expect(farmChores(log.state(), log.at).sharedRain).toBeNull();
    log.wait(4 * MINUTE).add('farm_opened', fig, {});
    const due = farmChores(log.state(), log.at).sharedRain;
    expect(due).toEqual({ day: '2026-10-19', people: [bea, pip, fig] });
    log.add('shared_rain', null, due);
    expect(farmChores(log.state(), log.at).sharedRain).toBeNull();
  });
});
