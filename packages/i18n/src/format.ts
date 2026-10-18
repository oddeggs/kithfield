import type { Entry, Language } from './catalogue-types';

export type Params = Readonly<Record<string, string | number>>;

const pluralRules = new Map<Language, Intl.PluralRules>();

/**
 * The plural category of a number. Uses `Intl.PluralRules`; on an engine without it, falls back
 * to the two rules these languages need (English: one or other; Vietnamese: other).
 */
export function pluralCategory(language: Language, count: number): Intl.LDMLPluralRule {
  if (typeof Intl === 'undefined' || typeof Intl.PluralRules !== 'function') {
    return language === 'en' && count === 1 ? 'one' : 'other';
  }
  let rules = pluralRules.get(language);
  if (rules === undefined) {
    rules = new Intl.PluralRules(language);
    pluralRules.set(language, rules);
  }
  return rules.select(count);
}

/**
 * The text of an entry: a plural picks its form from `params.count` by the language's rules, then
 * each `{name}` placeholder is filled from `params`. A placeholder with no value stays as written,
 * so a missing parameter shows up on screen instead of reading as an empty gap.
 */
export function formatEntry(language: Language, entry: Entry, params?: Params): string {
  const values: Params = params ?? {};
  let text: string;
  if (typeof entry === 'string') {
    text = entry;
  } else {
    const count = values['count'];
    const category = typeof count === 'number' ? pluralCategory(language, count) : 'other';
    text = entry[category] ?? entry.other;
  }
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = values[name];
    return value === undefined ? placeholder : String(value);
  });
}
