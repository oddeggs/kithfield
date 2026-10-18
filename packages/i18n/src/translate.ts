import type { Catalogue, Entry, Language, ParamsArgument, StringKey } from './catalogue-types';
import { en, vi } from './catalogues.generated';
import { formatEntry } from './format';
import { defaultLanguage } from './pick-language';

export const catalogues: { readonly [L in Language]: Catalogue } = { en, vi };

function isBlank(entry: Entry): boolean {
  return (typeof entry === 'string' ? entry : entry.other).trim() === '';
}

/** The entry for a key in a language, falling back to English when the language lacks it. */
function lookup(language: Language, key: string): { entry: Entry; language: Language } | null {
  const entry = (catalogues[language] as Readonly<Record<string, Entry | undefined>>)[key];
  if (entry !== undefined && !isBlank(entry)) return { entry, language };
  return language === defaultLanguage ? null : lookup(defaultLanguage, key);
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
  const found = lookup(language, key);
  if (found === null) return key;
  return formatEntry(found.language, found.entry, params);
}

/** A `t` bound to one language: what a screen holds once it knows its reader's language. */
export type Translate = <Key extends StringKey>(key: Key, ...params: ParamsArgument<Key>) => string;

export function translator(language: Language): Translate {
  return (key, ...params) => t(language, key, ...params);
}
