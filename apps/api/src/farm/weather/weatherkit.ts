import { type FarmPlace, type LocalDate, Weather } from '@kithfield/contracts';

import type { Bindings } from '../../env';
import type { WeatherProvider, WeatherReading } from '../ports';
import { DailyForecastResponse, forecastDay, roundedPlace, solarZone, weatherOf } from './forecast';
import { type WeatherKitConfig, weatherKitToken } from './token';

/*
 * The farm's daily weather from Apple's WeatherKit REST API. Readings are cached per place and
 * day (coordinates rounded to two decimals) in the Workers cache, so the farms of one town fetch
 * once. Without a key there is no weather: the farm writes nothing and never makes weather up.
 * Apple's attribution is shown wherever the weather appears (`GET /v1/weather/attribution`).
 */

export const WEATHERKIT_ORIGIN = 'https://weatherkit.apple.com';
export const WEATHERKIT_SOURCE = 'weatherkit';

/** A cached reading is kept 12 hours: long enough for a town's morning, short of tomorrow's. */
const CACHE_SECONDS = 12 * 60 * 60;
/** Where cached readings live: a made-up origin, so nothing real is ever shadowed. */
const CACHE_ORIGIN = 'https://weather-cache.kithfield.internal';

/** The WeatherKit settings, or null while any is missing. */
export const weatherKitConfig = (env: Bindings): WeatherKitConfig | null => {
  const key = env.WEATHERKIT_KEY;
  const teamId = env.WEATHERKIT_TEAM_ID;
  const keyId = env.WEATHERKIT_KEY_ID;
  const serviceId = env.WEATHERKIT_SERVICE_ID;
  if (!key || !teamId || !keyId || !serviceId) return null;
  return { key, teamId, keyId, serviceId };
};

/** Where readings are kept between farms; failures to keep or read are only misses. */
export interface ReadingCache {
  get(key: string): Promise<WeatherReading | null>;
  put(key: string, reading: WeatherReading): Promise<void>;
}

/** The Workers runtime's own cache (Node's typings, also loaded, describe a browser's instead). */
const defaultCache = (): Cache => (caches as unknown as { default: Cache }).default;

export const workersCache = (cache: () => Cache = defaultCache): ReadingCache => ({
  async get(key) {
    try {
      const hit = await cache().match(`${CACHE_ORIGIN}/${key}`);
      if (hit === undefined) return null;
      const body = await hit.json<{ weather?: unknown }>();
      const weather = Weather.safeParse(body.weather);
      return weather.success ? { weather: weather.data, source: WEATHERKIT_SOURCE } : null;
    } catch {
      return null;
    }
  },
  async put(key, reading) {
    try {
      const response = Response.json(
        { weather: reading.weather },
        { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } },
      );
      await cache().put(`${CACHE_ORIGIN}/${key}`, response);
    } catch {
      // A reading that isn't kept is fetched again by the next farm.
    }
  },
});

/**
 * Apple answered something other than a forecast, or didn't answer: `status` is 0 when no answer
 * came (`reason` `timeout` or `network`) or the key couldn't sign a token (`unusable_key`).
 */
export class WeatherKitError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(`WeatherKit answered ${status}${reason === null ? '' : ` (${reason})`}`);
    this.name = 'WeatherKitError';
  }
}

/**
 * What a failure to read the weather calls for: `auth` (the key is refused or unusable: stop
 * asking), `retry` (Apple is busy, down or unreachable: ask again later), or `give_up` (Apple
 * answered something this server can't use: asking again would get the same).
 */
export const weatherFailure = (error: unknown): 'auth' | 'retry' | 'give_up' => {
  if (!(error instanceof WeatherKitError)) return 'retry';
  const { status, reason } = error;
  if (status === 401 || status === 403 || reason === 'unusable_key') return 'auth';
  if (status === 0 || status === 429 || status >= 500) return 'retry';
  return 'give_up';
};

/** Apple gets this long to answer; a slow answer counts as no answer. */
export const WEATHERKIT_TIMEOUT_MS = 10_000;

/** After Apple refuses the key, nothing asks again for this long. */
export const AUTH_REFUSED_MS = 6 * 60 * 60_000;

const reasonOf = async (response: Response): Promise<string | null> => {
  try {
    const body = await response.json<{ reason?: unknown }>();
    return typeof body.reason === 'string' ? body.reason.slice(0, 40) : null;
  } catch {
    return null;
  }
};

export type WeatherKitDeps = {
  fetch: typeof fetch;
  cache: ReadingCache;
  /** Epoch milliseconds, for the token's times. */
  now: () => number;
};

/** Asks Apple for the place's daily forecast and reads the day out of it. */
const fetchReading = async (
  deps: WeatherKitDeps,
  config: WeatherKitConfig,
  place: FarmPlace,
  day: LocalDate,
  timeZone: string | undefined,
): Promise<WeatherReading | null> => {
  const { lat, lng } = roundedPlace(place);
  const url = new URL(`${WEATHERKIT_ORIGIN}/api/v1/weather/en/${lat}/${lng}`);
  url.searchParams.set('dataSets', 'forecastDaily');
  url.searchParams.set('timezone', timeZone ?? solarZone(Number(lng)));
  url.searchParams.set('countryCode', place.country);
  let token: string;
  try {
    token = await weatherKitToken(config, Math.floor(deps.now() / 1000));
  } catch {
    throw new WeatherKitError(0, 'unusable_key');
  }
  let body: unknown;
  try {
    const response = await deps.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(WEATHERKIT_TIMEOUT_MS),
    });
    if (!response.ok) throw new WeatherKitError(response.status, await reasonOf(response));
    body = await response.json();
  } catch (error) {
    if (error instanceof WeatherKitError) throw error;
    if (error instanceof SyntaxError) throw new WeatherKitError(200, 'unreadable');
    const timedOut = (error as { name?: unknown } | null)?.name === 'TimeoutError';
    throw new WeatherKitError(0, timedOut ? 'timeout' : 'network');
  }
  const parsed = DailyForecastResponse.safeParse(body);
  if (!parsed.success) throw new WeatherKitError(200, 'unreadable');
  const forecast = parsed.data.forecastDaily?.days.find(
    (d) => forecastDay(d.forecastStart, Number(lng), timeZone) === day,
  );
  return forecast === undefined
    ? null
    : { weather: weatherOf(forecast), source: WEATHERKIT_SOURCE };
};

/** The WeatherKit provider over its fetch, cache and clock. */
export const weatherKitProvider = (deps: Partial<WeatherKitDeps> = {}): WeatherProvider => {
  const full: WeatherKitDeps = {
    fetch: deps.fetch ?? ((input, init) => fetch(input, init)),
    cache: deps.cache ?? workersCache(),
    now: deps.now ?? (() => Date.now()),
  };
  /**
   * Until when Apple is not asked, after it refused the key. Held by the provider, so for every
   * farm on this isolate (production has one provider per isolate): checked with no I/O before
   * anything else, unlike the Cache API, which costs a lookup per farm and may drop the mark
   * early. Each isolate learns of a refused key with one request every six hours at most.
   */
  let refusedUntil = 0;
  return {
    async today(env, place, day, timeZone) {
      if (full.now() < refusedUntil) return null;
      const config = weatherKitConfig(env);
      if (config === null) return null;
      const { lat, lng } = roundedPlace(place);
      const key = `${lat}/${lng}/${day}/${timeZone ?? 'solar'}`;
      const cached = await full.cache.get(key);
      if (cached !== null) return cached;
      try {
        const reading = await fetchReading(full, config, place, day, timeZone);
        if (reading !== null) await full.cache.put(key, reading);
        return reading;
      } catch (error) {
        if (weatherFailure(error) === 'auth') refusedUntil = full.now() + AUTH_REFUSED_MS;
        throw error;
      }
    },
  };
};

/** The provider the farms use. */
export const weatherKit: WeatherProvider = weatherKitProvider();
