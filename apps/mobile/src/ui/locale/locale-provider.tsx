import {
  fontLocaleFor,
  pickLanguage,
  translator,
  type FontLocale,
  type Language,
  type Translate,
} from '@kithfield/i18n';
import { useLocales } from 'expo-localization';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface Locale {
  language: Language;
  /** The locale `@kithfield/theme`'s `fontFor` reads: `vi` swaps the display and hand faces. */
  fontLocale: FontLocale;
  t: Translate;
}

const LocaleContext = createContext<Locale | null>(null);

function localeFor(language: Language): Locale {
  return { language, fontLocale: fontLocaleFor(language), t: translator(language) };
}

/**
 * The reading language from the device's preferred languages, or the person's own choice once
 * Settings stores one (`storedChoice`).
 */
export function LocaleProvider({
  storedChoice = null,
  children,
}: {
  readonly storedChoice?: string | null;
  readonly children: ReactNode;
}) {
  const locales = useLocales();
  const tags = locales.map((l) => l.languageTag).join(',');
  const language = pickLanguage(tags.split(','), storedChoice);
  const value = useMemo(() => localeFor(language), [language]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** A subtree in a fixed language: the developer gallery's Vietnamese column. */
export function LocaleScope({
  language,
  children,
}: {
  readonly language: Language;
  readonly children: ReactNode;
}) {
  const value = useMemo(() => localeFor(language), [language]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const locale = useContext(LocaleContext);
  if (locale === null) throw new Error('useLocale needs a LocaleProvider');
  return locale;
}
