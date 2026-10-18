import type { FarmPlace } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Bindings } from '../../src/env';
import type { WeatherReading } from '../../src/farm/ports';
import {
  type DayForecast,
  forecastDay,
  solarZone,
  weatherOf,
} from '../../src/farm/weather/forecast';
import { signWeatherKitToken, weatherKitToken } from '../../src/farm/weather/token';
import {
  type ReadingCache,
  WeatherKitError,
  weatherKitProvider,
  workersCache,
} from '../../src/farm/weather/weatherkit';

const london: FarmPlace = { city: 'London', country: 'GB', lat: 51.5072, lng: -0.1276 };
const hanoi: FarmPlace = { city: 'Hà Nội', country: 'VN', lat: 21.0285, lng: 105.8542 };

let pem = '';
let publicKey: CryptoKey;

const toPem = (der: ArrayBuffer, newline: string): string => {
  let binary = '';
  for (const byte of new Uint8Array(der)) binary += String.fromCharCode(byte);
  const lines = btoa(binary).match(/.{1,64}/g) ?? [];
  return ['-----BEGIN PRIVATE KEY-----', ...lines, '-----END PRIVATE KEY-----'].join(newline);
};

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  pem = toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey), '\n');
  publicKey = pair.publicKey;
});

const config = () => ({
  key: pem,
  teamId: 'YFND2EEW8S',
  keyId: 'UC6TN76PKY',
  serviceId: 'com.kithfield.app',
});

const withKey = (key: string | undefined): Bindings =>
  ({ ...env, WEATHERKIT_KEY: key }) as unknown as Bindings;

const decode = (part: string): unknown =>
  JSON.parse(atob(part.replaceAll('-', '+').replaceAll('_', '/')));

const fromBase64url = (part: string): Uint8Array<ArrayBuffer> => {
  const padded = part.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const day = (over: Partial<DayForecast> = {}): DayForecast => ({
  forecastStart: '2054-10-19T00:00:00Z',
  temperatureMax: 16,
  temperatureMin: 8,
  precipitationChance: 0.1,
  precipitationAmount: 0,
  precipitationType: 'clear',
  snowfallAmount: 0,
  ...over,
});

/** A cache in memory, counting what it was asked. */
class MemoryCache implements ReadingCache {
  readonly kept = new Map<string, WeatherReading>();
  get(key: string) {
    return Promise.resolve(this.kept.get(key) ?? null);
  }
  put(key: string, reading: WeatherReading) {
    this.kept.set(key, reading);
    return Promise.resolve();
  }
}

/** A stand-in for Apple: answers each request with the next response, and keeps the requests. */
const appleDouble = (...responses: (() => Response)[]) => {
  const asked: Request[] = [];
  const fetcher = (input: RequestInfo | URL, init?: RequestInit) => {
    asked.push(new Request(input, init));
    const next = responses.shift();
    if (next === undefined) throw new Error('Apple was asked too often');
    return Promise.resolve(next());
  };
  return { asked, fetch: fetcher };
};

const forecast =
  (...days: DayForecast[]) =>
  () =>
    Response.json({ forecastDaily: { name: 'DailyForecast', days } });

describe('the WeatherKit token', () => {
  it('names the team, key and Services ID, and is signed with the key', async () => {
    const token = await signWeatherKitToken(config(), 1_800_000_000);
    const [header, claims, signature] = token.split('.') as [string, string, string];
    expect(decode(header)).toEqual({
      alg: 'ES256',
      kid: 'UC6TN76PKY',
      id: 'YFND2EEW8S.com.kithfield.app',
    });
    expect(decode(claims)).toEqual({
      iss: 'YFND2EEW8S',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
      sub: 'com.kithfield.app',
    });
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromBase64url(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it('reads a key written on one line with escaped newlines', async () => {
    const oneLine = pem.replaceAll('\n', '\\n');
    const token = await signWeatherKitToken({ ...config(), key: oneLine }, 1_800_000_000);
    const [header, claims, signature] = token.split('.') as [string, string, string];
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromBase64url(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it('is reused while it has time left, and renewed near its end', async () => {
    const first = await weatherKitToken(config(), 1_900_000_000);
    expect(await weatherKitToken(config(), 1_900_000_000 + 49 * 60)).toBe(first);
    expect(await weatherKitToken(config(), 1_900_000_000 + 51 * 60)).not.toBe(first);
  });
});

describe('a forecast day as the farm reads it', () => {
  it('is rain when rain is likely and some falls', () => {
    const wet = { precipitationChance: 0.7, precipitationAmount: 4, precipitationType: 'rain' };
    expect(weatherOf(day(wet))).toBe('rain');
    expect(weatherOf(day({ ...wet, precipitationAmount: 0.4 }))).toBe('none');
    expect(weatherOf(day({ ...wet, precipitationChance: 0.3 }))).toBe('none');
  });

  it('is frost on a freezing night or a snowy day', () => {
    expect(weatherOf(day({ temperatureMin: 0 }))).toBe('frost');
    expect(weatherOf(day({ temperatureMin: 0.5 }))).toBe('none');
    const snowy = {
      temperatureMin: 1,
      precipitationChance: 0.8,
      precipitationAmount: 6,
      precipitationType: 'snow',
      snowfallAmount: 3,
    };
    expect(weatherOf(day(snowy))).toBe('frost');
  });

  it('is heat on a hot day', () => {
    expect(weatherOf(day({ temperatureMax: 30 }))).toBe('heat');
    expect(weatherOf(day({ temperatureMax: 29.9 }))).toBe('none');
  });

  it('puts rain before frost and frost before heat', () => {
    const wet = { precipitationChance: 0.9, precipitationAmount: 8, precipitationType: 'sleet' };
    expect(weatherOf(day({ ...wet, temperatureMin: -2, temperatureMax: 31 }))).toBe('rain');
    expect(weatherOf(day({ temperatureMin: -1, temperatureMax: 31 }))).toBe('frost');
  });

  it('rolls days up in the solar zone of the place', () => {
    expect(solarZone(-0.13)).toBe('Etc/GMT');
    expect(solarZone(105.85)).toBe('Etc/GMT-7');
    expect(solarZone(-74)).toBe('Etc/GMT+5');
    expect(forecastDay('2054-10-18T17:00:00Z', 105.85)).toBe('2054-10-19');
    expect(forecastDay('2054-10-19T05:00:00Z', -74)).toBe('2054-10-19');
  });
});

describe('the WeatherKit provider', () => {
  it('asks Apple for the day and reads it', async () => {
    const apple = appleDouble(
      forecast(
        day({ forecastStart: '2054-10-18T17:00:00Z', temperatureMax: 33 }),
        day({ forecastStart: '2054-10-19T17:00:00Z', temperatureMin: -3 }),
      ),
    );
    const provider = weatherKitProvider({ fetch: apple.fetch, cache: new MemoryCache() });
    const reading = await provider.today(withKey(pem), hanoi, '2054-10-19');
    expect(reading).toEqual({ weather: 'heat', source: 'weatherkit' });
    const [request] = apple.asked;
    const url = new URL(request!.url);
    expect(url.origin + url.pathname).toBe(
      'https://weatherkit.apple.com/api/v1/weather/en/21.03/105.85',
    );
    expect(url.searchParams.get('dataSets')).toBe('forecastDaily');
    expect(url.searchParams.get('timezone')).toBe('Etc/GMT-7');
    expect(request!.headers.get('Authorization')).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it('answers a second farm in the same town from the cache', async () => {
    const cache = new MemoryCache();
    const apple = appleDouble(forecast(day({ temperatureMin: -1 })));
    const provider = weatherKitProvider({ fetch: apple.fetch, cache });
    const first = await provider.today(withKey(pem), london, '2054-10-19');
    const nearby = { ...london, lat: 51.5074, lng: -0.1278 };
    const second = await provider.today(withKey(pem), nearby, '2054-10-19');
    expect(first).toEqual({ weather: 'frost', source: 'weatherkit' });
    expect(second).toEqual(first);
    expect(apple.asked).toHaveLength(1);
  });

  it('keeps readings in the Workers cache', async () => {
    const cache = workersCache();
    const place = { ...london, lat: 12.34, lng: 56.78 };
    const apple = appleDouble(forecast(day({ temperatureMax: 35 })));
    const provider = weatherKitProvider({ fetch: apple.fetch, cache });
    await provider.today(withKey(pem), place, '2054-10-19');
    const again = weatherKitProvider({ fetch: appleDouble().fetch, cache });
    expect(await again.today(withKey(pem), place, '2054-10-19')).toEqual({
      weather: 'heat',
      source: 'weatherkit',
    });
  });

  it('reports nothing without a key, and never asks Apple', async () => {
    const apple = appleDouble();
    const provider = weatherKitProvider({ fetch: apple.fetch, cache: new MemoryCache() });
    expect(await provider.today(withKey(undefined), london, '2054-10-19')).toBeNull();
    expect(await provider.today(withKey(''), london, '2054-10-19')).toBeNull();
    expect(apple.asked).toHaveLength(0);
  });

  it('reports nothing for a day outside the forecast', async () => {
    const apple = appleDouble(forecast(day({ forecastStart: '2054-10-25T00:00:00Z' })));
    const provider = weatherKitProvider({ fetch: apple.fetch, cache: new MemoryCache() });
    expect(await provider.today(withKey(pem), london, '2054-10-19')).toBeNull();
  });

  it('throws when Apple refuses, so the farm tries again later', async () => {
    const apple = appleDouble(() => Response.json({ reason: 'NOT_ENABLED' }, { status: 401 }));
    const provider = weatherKitProvider({ fetch: apple.fetch, cache: new MemoryCache() });
    const asked = provider.today(withKey(pem), london, '2054-10-19');
    await expect(asked).rejects.toBeInstanceOf(WeatherKitError);
    await expect(asked).rejects.toMatchObject({ status: 401, reason: 'NOT_ENABLED' });
  });

  it('throws on an answer it cannot read', async () => {
    const apple = appleDouble(() => Response.json({ forecastDaily: { days: [{}] } }));
    const provider = weatherKitProvider({ fetch: apple.fetch, cache: new MemoryCache() });
    await expect(provider.today(withKey(pem), london, '2054-10-19')).rejects.toBeInstanceOf(
      WeatherKitError,
    );
  });
});
