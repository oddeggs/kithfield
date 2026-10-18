import type {
  LocalDate,
  Place,
  SeedPlantedPayload,
  SeedState,
  Seq,
  Yeses,
} from '@kithfield/contracts';
import type { Translate } from '@kithfield/i18n';
import { planConditions } from '@kithfield/farm';

import { stageOf, type SeedStage } from './plan-status';

/** A plan being planted: what the plant sheet holds before it goes to the farm. */
export interface PlanDraft {
  readonly title: string;
  readonly days: readonly LocalDate[];
  readonly place: string;
  readonly yeses: Yeses;
}

const TITLE_MAX = 80;
const PLACE_MAX = 120;

/** A message's text as a plan's first title: its first line, trimmed to fit. */
export function titleFrom(text: string): string {
  const line = (text.split('\n')[0] ?? '').trim();
  return line.length <= TITLE_MAX ? line : `${line.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

const placeOf = (name: string): Place | null => {
  const trimmed = name.trim().slice(0, PLACE_MAX);
  return trimmed === '' ? null : { name: trimmed };
};

export const canPlant = (draft: PlanDraft): boolean => draft.title.trim() !== '';

/** The `seed_planted` payload a draft becomes. */
export function plantPayload(
  draft: PlanDraft,
  options: { fromSeq?: Seq | undefined; someday?: boolean } = {},
): SeedPlantedPayload {
  return {
    ...(options.fromSeq !== undefined ? { fromSeq: options.fromSeq } : {}),
    title: draft.title.trim().slice(0, TITLE_MAX),
    days: [...new Set(draft.days)].sort().map((date) => ({ date })),
    place: placeOf(draft.place),
    yeses: draft.yeses,
    someday: options.someday ?? false,
  };
}

/**
 * The stage a draft would plant at, as the farm will count it: a day (exactly one), a place, and
 * enough yeses from the people already in.
 */
export function draftStage(draft: PlanDraft, members: number, inSoFar: number): SeedStage {
  const seed: SeedState = {
    seq: 1,
    planter: 'draft',
    unsent: false,
    title: draft.title || '…',
    days: draft.days.map((date) => ({ date })),
    place: placeOf(draft.place),
    yeses: draft.yeses,
    someday: false,
    hat: 'draft',
    settleOn: null,
    votes: [],
    rsvps: Array.from({ length: inSoFar }, (_, i) => ({ person: `in${i}`, answer: 'in' })),
    checkins: [],
    sproutedAt: null,
  };
  return stageOf(seed, planConditions(seed, members));
}

/** Places the farm has planned at before, newest first, for a quick tap. */
export function placeSuggestions(seeds: readonly SeedState[], limit = 3): string[] {
  const names: string[] = [];
  for (const seed of [...seeds].sort((a, b) => b.seq - a.seq)) {
    const name = seed.place?.name;
    if (name && !names.includes(name)) names.push(name);
    if (names.length >= limit) break;
  }
  return names;
}

/** "Pip and you", "Pip, Bea and you": names joined the way a sentence says them. */
export function joinNames(t: Translate, names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const last = names[names.length - 1] ?? '';
  return t('plans.people.two', { first: names.slice(0, -1).join(', '), second: last });
}
