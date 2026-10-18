import { type EventKind, isTombstone, type Lang, MessagePayload } from '@kithfield/contracts';

import type { Envelope } from './farm-reads';
import { type AiBinding, type ChatMessage, write } from './models';

/*
 * The Sunday letter's words. The text model sees only what friends who said yes to `recap` wrote
 * that week and the kinds of care they gave, with every person (and the farm) as a placeholder, so
 * no name leaves. It never sees a count. What it writes is checked before it is kept: no numbers,
 * no counting or ranking words, no line lifted from a message, no name it wasn't given.
 */

/** Kinds of care a letter may name, in the words the model is given. Never how many. */
const CARE_WORDS: Partial<Record<EventKind, string>> = {
  dewdrop: 'dewdrops',
  message: 'messages',
  link: 'shared links',
  quiet_note: 'quiet notes',
  slow_post: 'slow posts',
  media: 'photos',
  sticker: 'stickers',
  voice: 'voice notes',
  fire: 'time by the fire',
  firefly: 'fireflies',
  wave: 'waves',
  knock: 'knocks',
  hug: 'hugs',
  gift: 'gifts',
  card_signed: 'birthday cards',
  seed_planted: 'planting plans',
  vote: 'helping pick a day',
  rsvp: 'saying yes to plans',
  checkin: 'turning up to a hangout',
  scrapbook_page: 'scrapbook pages',
};

/** How much of the week's words go out: the latest messages, each clipped. */
const MESSAGE_LIMIT = 60;
const MESSAGE_CHARS = 280;
const WORDS_BUDGET = 6000;

export type LetterPerson = { person: string; name: string; tag: string; care: string[] };
export type WeekFacts = {
  farmName: string;
  people: LetterPerson[];
  messages: { tag: string; text: string }[];
};

/**
 * What the letter is written from: the people who said yes and tended this week, the kinds of
 * care each gave, and their messages. Unsent and removed things are left out.
 */
export function weekFacts(
  events: readonly Envelope[],
  consenting: readonly string[],
  names: ReadonlyMap<string, string>,
  farmName: string,
): WeekFacts {
  const allowed = new Set(consenting);
  const care = new Map<string, Set<string>>();
  const messages: { person: string; text: string }[] = [];
  for (const event of events) {
    const actor = event.actor;
    if (actor === null || !allowed.has(actor) || !names.has(actor)) continue;
    if (isTombstone(event.payload)) continue;
    const word = CARE_WORDS[event.kind as EventKind];
    if (word === undefined) continue;
    const kinds = care.get(actor) ?? new Set<string>();
    kinds.add(word);
    care.set(actor, kinds);
    if (event.kind === 'message') {
      const parsed = MessagePayload.safeParse(event.payload);
      if (parsed.success) messages.push({ person: actor, text: parsed.data.text });
    }
  }
  const people: LetterPerson[] = consenting
    .filter((p) => care.has(p))
    .map((person, i) => ({
      person,
      name: names.get(person) ?? '',
      tag: `{p${i + 1}}`,
      care: [...(care.get(person) ?? [])],
    }));
  const tagOf = new Map(people.map((p) => [p.person, p.tag]));
  const chosen: { tag: string; text: string }[] = [];
  let budget = WORDS_BUDGET;
  for (const m of [...messages].reverse()) {
    const text = m.text.slice(0, MESSAGE_CHARS);
    const tag = tagOf.get(m.person);
    if (tag === undefined || budget - text.length < 0 || chosen.length >= MESSAGE_LIMIT) break;
    budget -= text.length;
    chosen.push({ tag, text });
  }
  return { farmName, people, messages: chosen.reverse() };
}

const LANGUAGE: Record<Lang, string> = { en: 'English', vi: 'Vietnamese' };

/** The prompt: the house rules first, then the week as data. */
export function letterPrompt(facts: WeekFacts, lang: Lang): ChatMessage[] {
  const rules = [
    `You write the Sunday letter for a small farm shared by close friends in a cosy app. Write in ${LANGUAGE[lang]}.`,
    'Answer with JSON only, like {"title": "...", "body": "..."}.',
    'The title is a warm headline of at most eight words about the week on {farm}.',
    'The body is one or two short sentences, under 300 characters, about what friends did together this week.',
    'Refer to the farm only as {farm} and to people only by the placeholders given, exactly as written, such as {p1}.',
    'Never use digits or number words. Never count, total, compare or rank anything, and never say who did the most or least.',
    'Never mention streaks, missed days, or anyone being quiet or absent.',
    'Never quote or repeat anyone’s messages: describe what the week was about in your own gentle words.',
    'Keep private things private: nothing about health, money, love lives or arguments.',
  ].join('\n');
  const week = {
    farm: '{farm}',
    people: facts.people.map((p) => ({ who: p.tag, care: p.care })),
    messages: facts.messages.map((m) => ({ from: m.tag, text: m.text })),
  };
  return [
    { role: 'system', content: rules },
    { role: 'user', content: JSON.stringify(week) },
  ];
}

/**
 * Counting, ranking and streak words a letter must not use (house rules), per language. Vietnamese
 * number words that are everyday words too (chín is also ripe, ba also dad, hai in cả hai is both)
 * are left to the digit check and the prompt.
 */
const NO_COUNTS: Record<Lang, RegExp> = {
  en: /(?<![\p{L}\p{M}])(once|twice|thrice|times|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozens?|hundreds?|most|least|top|ranked|ranking|winner|champion|streaks?|record|more than|fewer than|less than|every single|count(ed|ing|s)?|tally)(?![\p{L}\p{M}])/iu,
  vi: /(?<![\p{L}\p{M}])(lần|bốn|mười|chục|trăm|nhiều nhất|ít nhất|đứng đầu|xếp hạng|hạng|vô địch|kỷ lục|chuỗi|đếm|tổng cộng)(?![\p{L}\p{M}])/iu,
};

const DIGIT = /\p{Nd}/u;
const PLACEHOLDER = /\{[^{}]*\}/g;

/** Lowercase words, without punctuation, for spotting a line lifted from a message. */
const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w !== '');

/** Runs of this many words in a row from a message may not appear in the letter. */
const LIFTED_RUN = 5;

function liftsFrom(letter: string, messages: readonly { text: string }[]): boolean {
  const said = ` ${wordsOf(letter).join(' ')} `;
  for (const m of messages) {
    const words = wordsOf(m.text);
    for (let i = 0; i + LIFTED_RUN <= words.length; i += 1) {
      if (said.includes(` ${words.slice(i, i + LIFTED_RUN).join(' ')} `)) return true;
    }
  }
  return false;
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
  const names = new Map<string, string>([
    ['{farm}', facts.farmName],
    ...facts.people.map((p) => [p.tag, p.name] as const),
  ]);
  for (const text of [title, body]) {
    const words = text.normalize('NFC').replace(PLACEHOLDER, ' ');
    if (DIGIT.test(words) || NO_COUNTS[lang].test(words)) return null;
    if ((text.match(PLACEHOLDER) ?? []).some((tag) => !names.has(tag))) return null;
    if (liftsFrom(text, facts.messages)) return null;
  }
  const fill = (text: string) => text.replace(PLACEHOLDER, (tag) => names.get(tag) ?? tag).trim();
  const letter = { lang, title: fill(title), body: fill(body) };
  if (letter.title.length > 80 || letter.body.length > 1200) return null;
  return letter;
}

/** Tries this many times for a letter that keeps the rules before giving up for now. */
const TRIES = 3;

/** Writes the week's letter in one language; null when every try broke a rule. */
export async function writeLetter(
  ai: AiBinding,
  facts: WeekFacts,
  lang: Lang,
): Promise<WrittenLetter | null> {
  const prompt = letterPrompt(facts, lang);
  for (let i = 0; i < TRIES; i += 1) {
    const letter = checkLetter(await write(ai, prompt, 400), facts, lang);
    if (letter !== null) return letter;
  }
  return null;
}
