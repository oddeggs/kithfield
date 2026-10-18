import type { Lang } from '@kithfield/contracts';
import { t } from '@kithfield/i18n';

import type { WeekFacts } from './letter';

/*
 * What a Sunday letter must keep to before it is kept (the house rules): no numerals, no counting,
 * ranking or streak words, no run of words lifted from a message, no placeholder it wasn't given,
 * and no one's name except through a placeholder, so a friend who said no, or who left, never
 * appears. A quote translated into the other language is not caught here; the prompt asks for none.
 */

/**
 * Counting, ranking and streak words, per language. In Vietnamese, một (also "a"), hai and năm
 * (also "year") are refused too; the prompt asks the model to leave them out, so letters rarely
 * trip on them.
 */
const NO_COUNTS: Record<Lang, RegExp> = {
  en: /(?<![\p{L}\p{M}])(one|once|twice|thrice|times|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozens?|hundreds?|both|first|best|most|least|top|ranked|ranking|winner|champion|streaks?|record|in a row|consecutive(ly)?|every day|daily|more than|fewer than|less than|every single|count(ed|ing|s)?|tally)(?![\p{L}\p{M}])/iu,
  vi: /(?<![\p{L}\p{M}])(một|hai|năm|bốn|mười|chục|trăm|lần|nhất|đầu tiên|liên tiếp|liên tục|mỗi ngày|hằng ngày|đứng đầu|xếp hạng|hạng|vô địch|kỷ lục|chuỗi|đếm|tổng cộng)(?![\p{L}\p{M}])/iu,
};

const NUMERAL = /\p{N}/u;
const PLACEHOLDER = /\{[^{}]*\}/g;

/** Lowercase words in composed form, without punctuation, for spotting a lifted line. */
const wordsOf = (text: string): string[] =>
  text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w !== '');

/**
 * Whether the letter repeats a run of words from a message: five in a row, or the whole of a
 * shorter message, down to three words.
 */
function liftsFrom(letter: string, messages: readonly { text: string }[]): boolean {
  const said = ` ${wordsOf(letter).join(' ')} `;
  for (const m of messages) {
    const words = wordsOf(m.text);
    const run = Math.max(3, Math.min(5, words.length));
    for (let i = 0; i + run <= words.length; i += 1) {
      if (said.includes(` ${words.slice(i, i + run).join(' ')} `)) return true;
    }
  }
  return false;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether any of the names appears as a word or words in the text. */
function namesSomeone(text: string, names: readonly string[]): boolean {
  const plain = text.normalize('NFC');
  return names.some((name) => {
    const n = name.normalize('NFC').trim();
    if (n.length < 2) return false;
    return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escape(n)}(?![\\p{L}\\p{M}\\p{N}])`, 'iu').test(
      plain,
    );
  });
}

export type WrittenLetter = { lang: Lang; title: string; body: string };

/**
 * Checks what the model wrote and fills in the names; null when it breaks a rule, so it is
 * written again.
 */
export function checkLetter(raw: string, facts: WeekFacts, lang: Lang): WrittenLetter | null {
  // The object may come pretty-printed or fenced; a placeholder's brace is never followed by a quote.
  const start = raw.search(/\{\s*"/);
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const { title, body } = (parsed ?? {}) as { title?: unknown; body?: unknown };
  if (typeof title !== 'string' || typeof body !== 'string') return null;
  if (title.trim() === '' || body.trim() === '') return null;
  const fills = new Map<string, string>([
    ['{farm}', facts.farmName ?? t(lang, 'ai.letter.theFarm')],
    ...facts.people.map((p) => [p.tag, p.name] as const),
  ]);
  for (const text of [title, body]) {
    const words = text.normalize('NFC').replace(PLACEHOLDER, ' ');
    if (NUMERAL.test(words) || NO_COUNTS[lang].test(words)) return null;
    if ((text.match(PLACEHOLDER) ?? []).some((tag) => !fills.has(tag))) return null;
    if (namesSomeone(words, facts.names)) return null;
    if (liftsFrom(text, facts.messages)) return null;
  }
  const fill = (text: string) => text.replace(PLACEHOLDER, (tag) => fills.get(tag) ?? tag).trim();
  const letter = { lang, title: fill(title), body: fill(body) };
  if (letter.title.length > 80 || letter.body.length > 1200) return null;
  return letter;
}
