import type { EnCatalogue, Entry, FeatureCatalogues } from './catalogue-types';

function texts(entry: Entry): string[] {
  return typeof entry === 'string' ? [entry] : Object.values(entry);
}

/** The sorted `{name}` placeholders of an entry; a plural always takes `count`. */
function paramNames(entry: Entry): string[] {
  const names = new Set<string>(typeof entry === 'string' ? [] : ['count']);
  for (const text of texts(entry)) {
    for (const match of text.matchAll(/\{(\w+)\}/g)) names.add(match[1] ?? '');
  }
  return [...names].sort();
}

/** A placeholder whose name has a space or punctuation, which `t` would never fill. */
function oddPlaceholders(entry: Entry | undefined): string[] {
  if (entry === undefined) return [];
  return texts(entry).flatMap((text) => text.match(/\{[^}]*[^\w}][^}]*\}/g) ?? []);
}

function sameTexts(a: Entry, b: Entry): boolean {
  return texts(a).join('\n') === texts(b).join('\n');
}

/**
 * Everything wrong with a translation measured against its English, one line per problem, each
 * naming its key: a key in one language only, an empty string (in either language), a plural in one language only,
 * placeholders that differ or are not plain names, or text left in English for a key not listed in `sameInBoth`. An
 * empty list means the translation is complete.
 */
export function findCatalogueProblems(
  source: EnCatalogue,
  translation: EnCatalogue,
  sameInBoth: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(translation)) {
    if (!(key in source)) problems.push(`${key}: only in the translation`);
  }
  for (const key of sameInBoth) {
    if (!(key in source)) problems.push(`${key}: listed as the same in both, but not in English`);
  }
  for (const [key, sourceEntry] of Object.entries(source)) {
    if (texts(sourceEntry).some((text) => text.trim() === '')) {
      problems.push(`${key}: empty in English`);
    }
    const entry = translation[key];
    for (const [language, checked] of [
      ['English', sourceEntry],
      ['the translation', entry],
    ] as const) {
      for (const placeholder of oddPlaceholders(checked)) {
        problems.push(`${key}: placeholder ${placeholder} in ${language} is not a plain name`);
      }
    }
    if (entry === undefined) {
      problems.push(`${key}: missing from the translation`);
      continue;
    }
    if (texts(entry).some((text) => text.trim() === '')) {
      problems.push(`${key}: empty translation`);
      continue;
    }
    if ((typeof entry === 'string') !== (typeof sourceEntry === 'string')) {
      problems.push(`${key}: plural in one language only`);
      continue;
    }
    const expected = paramNames(sourceEntry).join(', ');
    const actual = paramNames(entry).join(', ');
    if (expected !== actual) {
      problems.push(`${key}: placeholders differ ({${expected}} in English, {${actual}} here)`);
    }
    const listedSame = sameInBoth.includes(key);
    const identical = texts(entry).some((text) => texts(sourceEntry).includes(text));
    if (identical && !listedSame) {
      problems.push(`${key}: still the English text ("${texts(entry).join(' / ')}")`);
    } else if (listedSame && !sameTexts(entry, sourceEntry)) {
      problems.push(`${key}: listed as the same in both, but the texts differ`);
    }
  }
  return problems;
}

/**
 * Everything wrong with one feature's pair: every key must start with the feature's prefix (so
 * two features never write the same key), and the Vietnamese must be complete.
 */
export function findFeatureProblems(feature: FeatureCatalogues): string[] {
  const prefix = `${feature.name}.`;
  const misnamed = Object.keys(feature.en)
    .filter((key) => !key.startsWith(prefix))
    .map((key) => `${key}: keys in ${feature.file}.en.ts start with "${prefix}"`);
  const incomplete = findCatalogueProblems(feature.en, feature.vi, feature.sameInBoth);
  return [...misnamed, ...incomplete].map((problem) => `${feature.file}: ${problem}`);
}
