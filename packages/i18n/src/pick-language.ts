import { languages } from './catalogue-types';
import type { Language } from './catalogue-types';

export const defaultLanguage: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (languages as readonly string[]).includes(value);
}

/** The language part of a locale tag: `vi-VN`, `vi_VN` and `VI` all give `vi`. */
function languageOfLocale(locale: string): string {
  return (locale.split(/[-_]/)[0] ?? '').toLowerCase();
}

/**
 * The reading language. A stored choice (the switch in Settings, or `/vi` on the website) wins
 * when it names a language we ship. Otherwise the first device locale we have a catalogue for
 * decides, so Vietnamese is used only when `vi` comes before `en` in the device's list. Anything
 * else is English.
 */
export function pickLanguage(
  deviceLocales: readonly string[],
  storedChoice?: string | null,
): Language {
  if (isLanguage(storedChoice)) return storedChoice;
  for (const locale of deviceLocales) {
    const language = languageOfLocale(locale);
    if (isLanguage(language)) return language;
  }
  return defaultLanguage;
}

/**
 * Which font stack a language reads in. Both languages share the faces (Fraunces, Kithfield Hand
 * and the system font all write Vietnamese); `vi` gives stacked marks taller lines.
 */
export const fontLocales = ['default', 'vi'] as const;
export type FontLocale = (typeof fontLocales)[number];

export function fontLocaleFor(language: Language): FontLocale {
  switch (language) {
    case 'vi':
      return 'vi';
    case 'en':
      return 'default';
  }
}
