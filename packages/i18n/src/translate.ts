import type { Catalogue, Entry, Language, ParamsArgument, StringKey } from './catalogue-types';
import { en, vi } from './catalogues.generated';
import { formatEntry } from './format';
import { defaultLanguage } from './pick-language';

export const catalogues: { readonly [L in Language]: Catalogue } = { en, vi };

function isBlank(entry: Entry): boolean {
  return (typeof entry === 'string' ? entry : entry.other).trim() === '';
}

type LooseCatalogues = { readonly [L in Language]: Readonly<Record<string, Entry | undefined>> };

/**
 * The entry for a key in a language and the language it is written in: the language's own when it
 * has a non-empty one, otherwise English's, otherwise null.
 */
export function resolveEntry(
  from: LooseCatalogues,
  language: Language,
  key: string,
): { entry: Entry; language: Language } | null {
  const entry = from[language][key];
  if (entry !== undefined && !isBlank(entry)) return { entry, language };
  return language === defaultLanguage ? null : resolveEntry(from, defaultLanguage, key);
}

/**
 * The copy for a key in a language. `{name}` placeholders are filled from `params`; a plural
 * picks its form from `params.count`. A key the language lacks reads in English; a key no
 * catalogue has (only possible from untyped input) reads as the key itself.
 */
export function t<Key extends StringKey>(
  language: Language,
  key: Key,
  ...[params]: ParamsArgument<Key>
): string {
  const found = resolveEntry(catalogues, language, key);
  if (found === null) return key;
  return formatEntry(found.language, found.entry, params);
}

/** A `t` bound to one language: what a screen holds once it knows its reader's language. */
export type Translate = <Key extends StringKey>(key: Key, ...params: ParamsArgument<Key>) => string;

export function translator(language: Language): Translate {
  return (key, ...params) => t(language, key, ...params);
}
