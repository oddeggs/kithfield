import { WeatherAttribution } from '@kithfield/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { weatherAttribution } from '../../src/rhythm/attribution';
import { api, newPerson } from '../farm/support/doubles';

/** What Apple's `/attribution/<lang>` answers (its shape as of 2026). */
const apple = (lang: string) => ({
  'logoDark@3x': `/assets/branding/${lang}/Apple_Weather_wht_${lang}_3X_090122.png`,
  'logoLight@1x': `/assets/branding/${lang}/Apple_Weather_blk_${lang}_1X_090122.png`,
  'logoLight@3x': `/assets/branding/${lang}/Apple_Weather_blk_${lang}_3X_090122.png`,
  'logoSquare@3x': '/assets/branding/square-mark@3x.png',
  serviceName: 'Apple Weather',
});

/** A cache in memory with the Workers cache's `match` and `put`. */
const memoryCache = () => {
  const kept = new Map<string, Response>();
  const cache = {
    match: (key: string) => Promise.resolve(kept.get(key)?.clone()),
    put: (key: string, response: Response) => {
      kept.set(key, response);
      return Promise.resolve();
    },
  };
  return () => cache as unknown as Cache;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the weather attribution', () => {
  it("is Apple's combined mark and legal page, as absolute URLs", async () => {
    const asked: string[] = [];
    const fetcher = (input: RequestInfo | URL) => {
      asked.push(new Request(input).url);
      return Promise.resolve(Response.json(apple('vi')));
    };
    const got = await weatherAttribution('weatherkit', 'vi', {
      fetch: fetcher,
      cache: memoryCache(),
    });
    expect(asked).toEqual(['https://weatherkit.apple.com/attribution/vi']);
    expect(WeatherAttribution.parse(got)).toEqual({
      source: 'weatherkit',
      serviceName: 'Apple Weather',
      markLight:
        'https://weatherkit.apple.com/assets/branding/vi/Apple_Weather_blk_vi_3X_090122.png',
      markDark:
        'https://weatherkit.apple.com/assets/branding/vi/Apple_Weather_wht_vi_3X_090122.png',
      legalUrl: 'https://weatherkit.apple.com/legal-attribution.html',
    });
  });

  it('gives Apple ten seconds to answer', async () => {
    const signals: unknown[] = [];
    const fetcher = (_input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal);
      return Promise.resolve(Response.json(apple('en')));
    };
    await weatherAttribution('weatherkit', 'en', { fetch: fetcher, cache: memoryCache() });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it('asks Apple once a day per language', async () => {
    let asked = 0;
    const fetcher = () => {
      asked++;
      return Promise.resolve(Response.json(apple('en')));
    };
    const deps = { fetch: fetcher as typeof fetch, cache: memoryCache() };
    const first = await weatherAttribution('weatherkit', 'en', deps);
    expect(await weatherAttribution('weatherkit', 'en', deps)).toEqual(first);
    expect(asked).toBe(1);
  });

  it('is none for a source this server does not fetch from', async () => {
    expect(await weatherAttribution('met_office', 'en')).toBeNull();
  });

  it('is served signed in, through the Workers cache', async () => {
    const pip = await newPerson('pip');
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(Response.json(apple('en'))));
    const first = await api(pip, 'GET', '/v1/weather/attribution?source=weatherkit&lang=en');
    expect(first.status).toBe(200);
    expect(WeatherAttribution.parse(first.body).markDark).toMatch(/_wht_en_3X/);
    const again = await api(pip, 'GET', '/v1/weather/attribution?source=weatherkit&lang=en');
    expect(again.body).toEqual(first.body);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('answers 404 for an unknown source, 400 for a bad query and 401 signed out', async () => {
    const pip = await newPerson('pip');
    const unknown = await api(pip, 'GET', '/v1/weather/attribution?source=met_office&lang=en');
    expect(unknown).toEqual({ status: 404, body: { error: { code: 'not_found' } } });
    const bad = await api(pip, 'GET', '/v1/weather/attribution?source=weatherkit&lang=fr');
    expect(bad.status).toBe(400);
    const out = await api(null, 'GET', '/v1/weather/attribution?source=weatherkit&lang=en');
    expect(out.status).toBe(401);
  });

  it('answers 503 when Apple cannot be reached', async () => {
    const pip = await newPerson('pip');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('', { status: 502 })),
    );
    const down = await api(pip, 'GET', '/v1/weather/attribution?source=weatherkit&lang=vi');
    expect(down).toEqual({ status: 503, body: { error: { code: 'unavailable' } } });
  });
});
