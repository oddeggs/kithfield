import { HttpUrl, type Lang, type WeatherAttribution } from '@kithfield/contracts';
import { z } from 'zod';

import { WEATHERKIT_ORIGIN, WEATHERKIT_SOURCE } from '../farm/weather/weatherkit';

/*
 * The weather provider's attribution, shown wherever the weather changes the farm. For WeatherKit
 * it is Apple's own (`/attribution/<lang>`): the combined Apple Weather mark for light and dark
 * backgrounds and the legal page, kept a day in the Workers cache.
 */

/** Apple's legal attribution page, used when its attribution doesn't name one. */
export const WEATHERKIT_LEGAL_URL = `${WEATHERKIT_ORIGIN}/legal-attribution.html`;

const CACHE_SECONDS = 24 * 60 * 60;

const AppleAttribution = z.object({
  serviceName: z.string().min(1).max(80),
  'logoLight@3x': z.string().min(1),
  'logoDark@3x': z.string().min(1),
  legalPageURL: z.string().optional(),
});

/** A path or URL from Apple's answer, made absolute against WeatherKit's origin. */
const absolute = (path: string): string => HttpUrl.parse(new URL(path, WEATHERKIT_ORIGIN).href);

const defaultCache = (): Cache => (caches as unknown as { default: Cache }).default;

export type AttributionDeps = { fetch: typeof fetch; cache: () => Cache };

const fetchApple = async (deps: AttributionDeps, lang: Lang): Promise<WeatherAttribution> => {
  const response = await deps.fetch(`${WEATHERKIT_ORIGIN}/attribution/${lang}`);
  if (!response.ok) throw new Error(`Apple's attribution answered ${response.status}`);
  const apple = AppleAttribution.parse(await response.json());
  return {
    source: WEATHERKIT_SOURCE,
    serviceName: apple.serviceName,
    markLight: absolute(apple['logoLight@3x']),
    markDark: absolute(apple['logoDark@3x']),
    legalUrl: absolute(apple.legalPageURL ?? WEATHERKIT_LEGAL_URL),
  };
};

/**
 * The attribution for a weather source in a language: null for a source this server doesn't
 * fetch from. Throws when the provider can't be reached and nothing is cached.
 */
export const weatherAttribution = async (
  source: string,
  lang: Lang,
  deps: Partial<AttributionDeps> = {},
): Promise<WeatherAttribution | null> => {
  if (source !== WEATHERKIT_SOURCE) return null;
  const full: AttributionDeps = {
    fetch: deps.fetch ?? ((input, init) => fetch(input, init)),
    cache: deps.cache ?? defaultCache,
  };
  const key = `https://weather-cache.kithfield.internal/attribution/${source}/${lang}`;
  try {
    const hit = await full.cache().match(key);
    if (hit !== undefined) return await hit.json<WeatherAttribution>();
  } catch {
    // A cache that can't be read is a miss.
  }
  const attribution = await fetchApple(full, lang);
  try {
    const kept = Response.json(attribution, {
      headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
    });
    await full.cache().put(key, kept);
  } catch {
    // Not kept: the next request asks Apple again.
  }
  return attribution;
};
