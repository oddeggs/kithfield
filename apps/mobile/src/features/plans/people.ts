import type { CritterLook } from '@kithfield/art';
import type { Critter, FarmState, PersonId } from '@kithfield/contracts';
import type { Translate } from '@kithfield/i18n';

/** A friend as plans draw them: a name to say and a critter to show. */
export interface PlanPerson {
  readonly person: PersonId;
  readonly name: string;
  readonly kind: string;
  readonly look: CritterLook;
  readonly you: boolean;
}

/** The art's look for a critter as the contracts carry it, layer by layer. */
export const lookOf = (critter: Critter): CritterLook => ({
  coat: critter.coat,
  ...(critter.mark ? { mark: critter.mark } : {}),
  ...(critter.outfit
    ? { outfit: { name: critter.outfit, ...(critter.outfitColor ? { color: critter.outfitColor } : {}) } }
    : {}),
  ...(critter.accessory ? { accessory: { name: critter.accessory } } : {}),
});

const FALLBACK_KIND = 'rabbit';

/**
 * A person on a farm by id, through the farm's aliases after a merge. Someone who has left keeps
 * their critter; a name that was removed reads as "a friend".
 */
export function personOn(
  state: FarmState,
  id: PersonId,
  me: PersonId | null,
  t: Translate,
): PlanPerson {
  const person = state.aliases[id] ?? id;
  const member = state.members.find((m) => m.person === person);
  const former = member ? undefined : state.former.find((f) => f.person === person);
  const critter = member?.critter ?? former?.critter;
  const you = person === me;
  return {
    person,
    name: you ? t('plans.people.you') : (member?.name ?? former?.name ?? t('plans.people.friend')),
    kind: critter?.species ?? FALLBACK_KIND,
    look: critter ? lookOf(critter) : {},
    you,
  };
}

/** People in order, with this person last, as "Pip and you" says them. */
export const youLast = (people: readonly PlanPerson[]): PlanPerson[] => [
  ...people.filter((p) => !p.you),
  ...people.filter((p) => p.you),
];
