import type { EnCatalogue, Entry } from './catalogue-types';

/**
 * Words the glossary in `01 Foundations` rules out of all copy, with the word to use instead.
 * Only the words the designs never use in copy are checked: "group", "call" and "meeting" do
 * appear in designed copy ("friend groups", "Seeds for meetings"), so they are left to review.
 */
export const avoidedWords: readonly { readonly pattern: RegExp; readonly instead: string }[] = [
  { pattern: /\bavatars?\b/i, instead: 'critter' },
  { pattern: /\busers?\b/i, instead: 'critter, or a friend’s name' },
  { pattern: /\bDMs?\b/, instead: 'visit' },
  { pattern: /\badmins?\b/i, instead: 'keeper' },
  { pattern: /\binactive\b/i, instead: 'dozing or sleepy' },
  { pattern: /\bservers?\b/i, instead: 'farm' },
  { pattern: /\bleft the group\b/i, instead: 'gone wandering' },
];

/** A number placed before an act of care: Kithfield never counts care given, received or missed. */
const careCount =
  /\{\w+\}\s+(dewdrops?|fireflies|firefly|waves?|tends?|tending|cares?|days? in a row|streaks?)\b/i;

function texts(entry: Entry): string[] {
  return typeof entry === 'string' ? [entry] : Object.values(entry);
}

/** English copy that breaks the house words, one line per problem, each naming its key. */
export function findHouseWordProblems(catalogue: EnCatalogue): string[] {
  const problems: string[] = [];
  for (const [key, entry] of Object.entries(catalogue)) {
    for (const text of texts(entry)) {
      for (const { pattern, instead } of avoidedWords) {
        const match = pattern.exec(text);
        if (match !== null) problems.push(`${key}: says "${match[0]}"; use ${instead}`);
      }
      const counted = careCount.exec(text);
      if (counted !== null) problems.push(`${key}: counts care ("${counted[0]}")`);
    }
  }
  return problems;
}
