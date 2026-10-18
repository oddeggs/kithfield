import {
  EditPayload,
  type EventKind,
  isTombstone,
  type Lang,
  MessagePayload,
} from '@kithfield/contracts';

import type { Envelope } from './farm-reads';
import { checkLetter, type WrittenLetter } from './letter-rules';
import { type AiBinding, type ChatMessage, write } from './models';

/*
 * The Sunday letter's words. The text model sees only what friends who said yes to `recap` wrote
 * that week (as last edited, never what they forwarded) and the kinds of care they gave, with every
 * person and the farm as a placeholder, so no name is sent. It never sees a count. Names reach the
 * letter only through those placeholders, filled in here; what the model writes is checked before
 * it is kept (`letter-rules.ts`).
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
  /** Null for a farm with no name: the letter says "the farm". */
  farmName: string | null;
  people: LetterPerson[];
  messages: { tag: string; text: string }[];
  /** Every member's and former member's name, which a letter may show only through a placeholder. */
  names: string[];
};

export type WeekPeople = {
  /** Members who said yes to `recap`, longest-standing first. */
  consenting: readonly string[];
  /** Names of the consenting members. */
  names: ReadonlyMap<string, string>;
  /** Every name on the farm, now or before, whoever said yes. */
  everyName: readonly string[];
};

/** The latest text of each message edited by its author, from every event read. */
function latestEdits(
  events: readonly Envelope[],
): Map<number, { actor: string | null; text: string }> {
  const edits = new Map<number, { actor: string | null; text: string }>();
  for (const event of events) {
    if (event.kind !== 'edit' || isTombstone(event.payload)) continue;
    const edit = EditPayload.safeParse(event.payload);
    if (edit.success) edits.set(edit.data.target, { actor: event.actor, text: edit.data.text });
  }
  return edits;
}

/**
 * What the letter is written from: the people who said yes and tended in the week `[from, to]`,
 * the kinds of care each gave, and their messages as last edited. Unsent, removed and forwarded
 * things are left out. `events` may run past `to`, so later edits are applied too.
 */
export function weekFacts(
  events: readonly Envelope[],
  week: { from: string; to: string },
  people: WeekPeople,
  farmName: string | null,
): WeekFacts {
  const allowed = new Set(people.consenting);
  const edits = latestEdits(events);
  const care = new Map<string, Set<string>>();
  const messages: { person: string; text: string }[] = [];
  for (const event of events) {
    const actor = event.actor;
    if (actor === null || !allowed.has(actor) || !people.names.has(actor)) continue;
    if (event.day === undefined || event.day < week.from || event.day > week.to) continue;
    if (isTombstone(event.payload)) continue;
    const word = CARE_WORDS[event.kind as EventKind];
    if (word === undefined) continue;
    if (event.kind === 'message') {
      const parsed = MessagePayload.safeParse(event.payload);
      // Forwarded words are someone else's, who never said yes here.
      if (!parsed.success || parsed.data.forwardedFrom !== undefined) continue;
      const edit = edits.get(event.seq);
      messages.push({ person: actor, text: edit?.actor === actor ? edit.text : parsed.data.text });
    }
    const kinds = care.get(actor) ?? new Set<string>();
    kinds.add(word);
    care.set(actor, kinds);
  }
  const tended: LetterPerson[] = people.consenting
    .filter((p) => care.has(p))
    .map((person, i) => ({
      person,
      name: people.names.get(person) ?? '',
      tag: `{p${i + 1}}`,
      care: [...(care.get(person) ?? [])],
    }));
  const tagOf = new Map(tended.map((p) => [p.person, p.tag]));
  const chosen: { tag: string; text: string }[] = [];
  let budget = WORDS_BUDGET;
  for (const m of [...messages].reverse()) {
    const text = m.text.slice(0, MESSAGE_CHARS);
    const tag = tagOf.get(m.person);
    if (tag === undefined || budget - text.length < 0 || chosen.length >= MESSAGE_LIMIT) break;
    budget -= text.length;
    chosen.push({ tag, text });
  }
  return {
    farmName,
    people: tended,
    messages: chosen.reverse(),
    names: [...new Set(people.everyName)],
  };
}

const LANGUAGE: Record<Lang, string> = { en: 'English', vi: 'Vietnamese' };

/** Words the model is asked to leave out, beyond the rules; the checks refuse them anyway. */
const AVOID: Record<Lang, string> = {
  en: 'Avoid the words one, both, first, best, daily and every day.',
  vi: 'Avoid the words một, hai, năm, nhất, đầu tiên, mỗi ngày and hằng ngày.',
};

/** The prompt: the house rules first, then the week as data. */
export function letterPrompt(facts: WeekFacts, lang: Lang): ChatMessage[] {
  const rules = [
    `You write the Sunday letter for a small farm shared by close friends in a cosy app. Write in ${LANGUAGE[lang]}.`,
    'Answer with JSON only, like {"title": "...", "body": "..."}.',
    'The title is a warm headline of at most eight words about the week on {farm}.',
    'The body is one or two short sentences, under 300 characters, about what friends did together this week.',
    'Refer to the farm only as {farm} and to people only by the placeholders given, exactly as written, such as {p1}.',
    'Never use digits or number words. Never count, total, compare or rank anything, and never say who did the most, least, first or best.',
    'Never mention streaks, days in a row, missed days, or anyone being quiet or absent.',
    AVOID[lang],
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
