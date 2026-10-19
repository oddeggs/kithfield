import type { FarmState, Hemisphere, LocalDate, PersonId, Season } from '@kithfield/contracts';
import type { FarmView, PlanView } from '@kithfield/farm';
import type { Translate } from '@kithfield/i18n';

/*
 * The farm's words, worked out from what friends did: who to thank and for what, how a plan
 * stands, the season as the season pill says it. Never a count of care: credits name people and
 * kinds of care only.
 */

/** `t` for a key built from data (a plant, a species, a kind). */
type LooseTranslate = (key: string, params?: Readonly<Record<string, string | number>>) => string;
const loose = (t: Translate) => t as unknown as LooseTranslate;

/** The copy for a key built from data (a species, a plant): checked only when it is read. */
export const say = (
  t: Translate,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string => loose(t)(key, params);

/** "a and b", "a, b and c": the language's own list. */
export function listOf(t: Translate, items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  const head = items.slice(0, -1).reduce((a, b) => t('farm.list.comma', { a, b }));
  return t('farm.list.and', { a: head, b: items[items.length - 1] ?? '' });
}

/** A member's name, or "a friend" when their name is gone (a removed name, a deleted account). */
export function nameOf(t: Translate, state: FarmState | null, person: PersonId): string {
  const m =
    state?.members.find((x) => x.person === person) ??
    state?.former.find((x) => x.person === person);
  return m?.name ?? t('farm.someone');
}

const SEASON_START: Record<Hemisphere, Record<Season, number>> = {
  north: { spring: 3, summer: 6, autumn: 9, winter: 12 },
  south: { spring: 9, summer: 12, autumn: 3, winter: 6 },
};

/** The season pill: "late spring", "high summer", "first frost". */
export function seasonLabel(
  t: Translate,
  season: Season,
  today: LocalDate,
  hemisphere: Hemisphere,
): string {
  const month = Number(today.slice(5, 7));
  const third = (((month - SEASON_START[hemisphere][season]) % 12) + 12) % 12;
  return loose(t)(`farm.season.${season}.${Math.min(2, third)}`);
}

/** A kind of care as a plural noun ("dewdrops", "voice notes"); unknown kinds read as "care". */
export function careNoun(t: Translate, kind: string): string {
  const k = `farm.care.${kind}`;
  const text = loose(t)(k);
  return text === k ? t('farm.care.other') : text;
}

export interface Credits {
  /** The bold opening: "The clover's thick". */
  readonly lead: string;
  readonly rest: string;
  /** Whose critters stand beside the line, at most three. */
  readonly people: readonly PersonId[];
}

/**
 * The credit line under the farm: the plant that has grown furthest, who it thanks and for what,
 * and up to two more friends whose care kept things going. Names and kinds, never totals.
 */
export function farmCredits(t: Translate, state: FarmState, view: FarmView): Credits {
  const grown = view.plants
    .map((p) => ({ view: p, plant: state.plants.find((s) => s.plant === p.plant) }))
    .filter((p) => p.view.stage >= 1 && p.plant && p.plant.credits.length > 0)
    .sort(
      // The furthest grown, a family's own plant before the signature crop all care grows.
      (a, b) =>
        b.view.stage - a.view.stage ||
        Number(b.view.family !== null) - Number(a.view.family !== null) ||
        (b.plant?.credits.length ?? 0) - (a.plant?.credits.length ?? 0),
    );
  const top = grown[0];
  const first = top?.plant?.credits[0];
  if (!top || !first) {
    return { lead: t('farm.credits.none.lead'), rest: t('farm.credits.none.rest'), people: [] };
  }
  const whose = (person: PersonId, kind: string | undefined) =>
    t('farm.credits.whose', { name: nameOf(t, state, person), care: careNoun(t, kind ?? '') });
  const plant = loose(t)(`farm.plant.${top.view.plant}`);
  const lead = loose(t)(`farm.credits.lead.${top.view.stage}`, { plant });
  const others: { person: PersonId; kind: string | undefined }[] = [];
  for (const g of grown) {
    for (const c of g.plant?.credits ?? []) {
      if (others.length >= 2) break;
      if (c.person === first.person || others.some((o) => o.person === c.person)) continue;
      others.push({ person: c.person, kind: c.kinds[0] });
    }
  }
  const thanks = t('farm.credits.thanks', { whose: whose(first.person, first.kinds[0]) });
  const kept = others.length
    ? t('farm.credits.kept', {
        whose: listOf(
          t,
          others.map((o) => whose(o.person, o.kind)),
        ),
      })
    : '';
  return {
    lead,
    rest: kept ? `${thanks} ${kept}` : thanks,
    people: [first.person, ...others.map((o) => o.person)],
  };
}

/** How a plan stands: what it has, and what it still needs. */
export function planLine(t: Translate, plan: PlanView): string {
  if (plan.seed.someday) return t('farm.plan.someday');
  const { day, place, yeses } = plan.conditions;
  return loose(t)(`farm.plan.${day ? 1 : 0}${place ? 1 : 0}${yeses ? 1 : 0}`);
}

/** Hours a status bubble has left of its day, rounded up: "23h left". */
export const hoursLeft = (at: number, now: number, lifeMs: number): number =>
  Math.min(Math.ceil(lifeMs / 3_600_000), Math.max(1, Math.ceil((at + lifeMs - now) / 3_600_000)));

/**
 * Who lives here, as the sheet says it: "a fox, a bear and two rabbits". Kinds with the most
 * critters first, at most five kinds.
 */
export function crowdLine(t: Translate, species: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const s of species) counts.set(s, (counts.get(s) ?? 0) + 1);
  const groups = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s, n]) =>
      n === 1
        ? loose(t)(`farm.species.${s}.a`)
        : loose(t)(`farm.species.${s}.some`, { count: n, number: numberWord(t, n) }),
    );
  const line = listOf(t, groups);
  // It opens a sentence.
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** A plan's flag on the farm, in hand lettering: its first word as a question ("picnic?"). */
export function flagOf(t: Translate, title: string): string {
  const word = title.trim().split(/\s+/)[0] ?? title;
  return t('farm.plan.flag', { word: word.toLocaleLowerCase() });
}

/** A number in words up to the 24 a farm holds ("twelve"), in digits past that. */
export function numberWord(t: Translate, n: number): string {
  const k = `farm.number.${n}`;
  const word = loose(t)(k);
  return word === k ? String(n) : word;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Who lives here, counted in words: "Twelve critters live here". */
export function headcount(t: Translate, n: number): string {
  return capital(t('farm.crowd.title', { count: n, number: numberWord(t, n) }));
}

/**
 * The farm's short name, for the largest text sizes (`12 States`, AX5): "The Thursday Lot" reads
 * "Thursday Lot". A name that is only an article stays whole.
 */
export function shortName(name: string): string {
  const short = name.replace(/^(the|a|an)\s+/i, '').trim();
  return short.length > 0 ? short : name;
}
