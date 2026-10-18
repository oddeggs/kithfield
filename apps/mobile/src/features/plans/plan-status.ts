import type { FarmId, LocalDate, PersonId, SeedState, Yeses } from '@kithfield/contracts';
import { addDays, type PlanConditions } from '@kithfield/farm';

/*
 * Where a plan stands, read from the shared farm state: which day it is on, what it still needs
 * and where it sits in the seed bed. Nothing here is stored; it is all worked out from the seed.
 */

/** A seed's art stage: one per condition met, and full bloom once it has sprouted. */
export type SeedStage = 0 | 1 | 2 | 3;

export function stageOf(seed: SeedState, conditions: PlanConditions): SeedStage {
  if (seed.sproutedAt !== null) return 3;
  const met = [conditions.day, conditions.place, conditions.yeses].filter(Boolean).length;
  return Math.min(met, 3) as SeedStage;
}

/** The day options the most people lean on, by index, earliest first. */
export function leadingOptions(seed: SeedState): number[] {
  const counts = seed.days.map((_, i) => seed.votes.find((v) => v.option === i)?.people.length ?? 0);
  const most = Math.max(0, ...counts);
  if (most === 0) return [];
  return counts
    .map((count, i) => ({ count, i }))
    .filter((c) => c.count === most)
    .map((c) => c.i);
}

/** Who leans on a day option. */
export const votersOf = (seed: SeedState, option: number): readonly PersonId[] =>
  seed.votes.find((v) => v.option === option)?.people ?? [];

/**
 * The plan's day, once it has one: its only day, or the fullest bud (the earliest of a tie) once
 * a settling day is set. Null while friends are still picking with no settling day.
 */
export function planDay(seed: SeedState): LocalDate | null {
  if (seed.days.length === 1) return seed.days[0]?.date ?? null;
  if (seed.settleOn === null) return null;
  const leading = leadingOptions(seed)[0] ?? 0;
  return seed.days[leading]?.date ?? null;
}

/** Friends can still lean on a day: more than one, and the settling day hasn't come. */
export const stillVoting = (seed: SeedState, today: LocalDate): boolean =>
  seed.days.length > 1 && (seed.settleOn === null || today < seed.settleOn);

/** The plan's start time on its day, if one was given. */
export function planTime(seed: SeedState, day: LocalDate | null): string | null {
  return seed.days.find((d) => d.date === day)?.from ?? null;
}

/** The people who said they're in. */
export const peopleIn = (seed: SeedState): PersonId[] =>
  seed.rsvps.filter((r) => r.answer === 'in').map((r) => r.person);

export type BedKind = 'today' | 'sprouted' | 'growing' | 'picking' | 'needs' | 'someday';

/** Sprouted plans first, then growing, then needs-something, then resting seeds. */
const ORDER: Record<BedKind, number> = {
  today: 0,
  sprouted: 1,
  growing: 2,
  picking: 3,
  needs: 4,
  someday: 5,
};

export interface BedEntry {
  readonly farm: FarmId;
  readonly farmName: string | null;
  readonly timeZone: string;
  readonly seed: SeedState;
  readonly stage: SeedStage;
  readonly kind: BedKind;
  /** The plan's day, once it has one. */
  readonly day: LocalDate | null;
  readonly conditions: PlanConditions;
}

export function bedKindOf(
  seed: SeedState,
  conditions: PlanConditions,
  today: LocalDate,
): BedKind {
  if (seed.someday) return 'someday';
  const day = planDay(seed);
  if (seed.sproutedAt !== null) return day === today ? 'today' : 'sprouted';
  if (seed.days.length > 1 && day === null) return 'picking';
  if (conditions.day && conditions.place) return 'growing';
  return 'needs';
}

/** How long a sprouted plan stays in the seed bed after its day, before it rests in memory. */
const KEEP_AFTER_DAYS = 1;

/** Whether a plan still belongs in the seed bed: its day hasn't long passed. */
export function stillGrowing(entry: Pick<BedEntry, 'day' | 'seed'>, today: LocalDate): boolean {
  if (entry.seed.someday || entry.day === null) return true;
  return entry.day >= addDays(today, -KEEP_AFTER_DAYS);
}

export function sortBed<T extends Pick<BedEntry, 'kind' | 'day' | 'seed' | 'farm'>>(
  entries: readonly T[],
): T[] {
  return [...entries].sort(
    (a, b) =>
      ORDER[a.kind] - ORDER[b.kind] ||
      (a.day ?? '9999').localeCompare(b.day ?? '9999') ||
      b.seed.seq - a.seed.seq ||
      a.farm.localeCompare(b.farm),
  );
}

/** What a sprouted plan says about who's in, by how many yeses it asked for. */
export const inPhraseKey = (yeses: Yeses) =>
  (
    ({
      couple: 'plans.bed.inCouple',
      most: 'plans.bed.inMost',
      everyone: 'plans.bed.inEveryone',
    }) as const
  )[yeses];

/** What a plan that needs something says it needs. */
export function needsKey(conditions: PlanConditions) {
  if (!conditions.day && !conditions.place) return 'plans.bed.needsBoth' as const;
  return conditions.day ? ('plans.bed.needsPlace' as const) : ('plans.bed.needsDay' as const);
}
