import { isTombstone, type FarmState, type PersonId } from '@kithfield/contracts';
import { useMemo } from 'react';

import { kithfieldRules } from '../../../data';
import { useLocale } from '../../../ui/locale/locale-provider';
import { lookOf } from '../model/people';
import type { LogEvent, TimelineItem } from '../model/timeline';
import type { MentionRow } from './composer';

const HOUR = 60 * 60 * 1000;

/** "Pip, Fig and Bea are out": who has the farm open now, apart from this person. */
export function useOutLine(
  state: FarmState | null,
  here: readonly PersonId[],
  me: PersonId | null,
): string {
  const { t } = useLocale();
  const names = here
    .filter((p) => p !== me)
    .map((p) => state?.members.find((m) => m.person === (state.aliases[p] ?? p))?.name)
    .filter((n): n is string => typeof n === 'string');
  const [a = '', b = '', c = ''] = names;
  if (names.length === 0) return t('chat.room.out.none');
  if (names.length === 1) return t('chat.room.out.one', { a });
  if (names.length === 2) return t('chat.room.out.two', { a, b });
  if (names.length === 3) return t('chat.room.out.three', { a, b, c });
  return t('chat.room.out.many', { a, b, c });
}

/** The @ list: every member but this person, with how they are, dozing ones marked to go last. */
export function useMentionRows(
  state: FarmState | null,
  me: PersonId | null,
  now: number,
): MentionRow[] {
  const { t } = useLocale();
  return useMemo(() => {
    if (!state) return [];
    let sleepy = new Set<PersonId>();
    try {
      sleepy = new Set(
        kithfieldRules
          .farmView(state, now)
          .critters.filter((c) => c.sleepy || c.hibernating || c.paused)
          .map((c) => c.person),
      );
    } catch {
      sleepy = new Set();
    }
    return state.members
      .filter((m) => m.person !== me && m.name !== null)
      .map((m) => {
        const dozing = sleepy.has(m.person);
        const species = t(`chat.species.${m.critter.species}`);
        const lampOn = !dozing && m.battery === 'open' && (m.lastOpenedAt ?? 0) > now - 12 * HOUR;
        const how = dozing
          ? t('chat.mention.detail', { species, state: t('chat.mention.napping') })
          : lampOn
            ? t('chat.mention.detail', { species, state: t('chat.mention.lampOn') })
            : species;
        return {
          person: m.person,
          name: m.name ?? '',
          dozing,
          species: m.critter.species,
          look: lookOf(m.critter),
          how,
        };
      });
  }, [state, me, now, t]);
}

/** Whether a plan planted from a message has sprouted (a card on the noticeboard says so). */
export function sprouted(
  events: readonly LogEvent[],
  state: FarmState | null,
  seq: number,
): boolean {
  const planted = events.find(
    (e) =>
      e.kind === 'seed_planted' &&
      !isTombstone(e.payload) &&
      (e.payload as { fromSeq?: unknown }).fromSeq === seq,
  );
  if (!planted) return false;
  return state?.seeds.some((s) => s.seq === planted.seq && s.sproutedAt !== null) ?? false;
}

/** Where each bubble sits in a run of one person's bubbles: names and critters go on the first. */
export function runsOf(rows: readonly TimelineItem[]): { first: boolean }[] {
  const actorAt = (i: number) => {
    const r = rows[i];
    return r?.type === 'bubble' ? `${r.mine ? 'me' : (r.actor ?? '')}` : null;
  };
  return rows.map((r, i) => {
    if (r.type !== 'bubble') return { first: true };
    const who = actorAt(i);
    return { first: actorAt(i - 1) !== who };
  });
}
