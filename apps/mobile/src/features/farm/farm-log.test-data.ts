import {
  FarmEvent,
  type Critter,
  type EventKind,
  type FarmState,
  type PersonId,
  type Species,
} from '@kithfield/contracts';
import { RULES_VERSION, localDay, replay } from '@kithfield/farm';

/* A farm's log for the farm screens' tests, written the way the farm object writes it. */

export const DAY = 24 * 60 * 60 * 1000;
/** 10:00 in London on Sunday 18 October 2026: autumn in the north. */
export const T0 = Date.UTC(2026, 9, 18, 9, 0);

export const critterOf = (species: Species): Critter => ({
  species,
  coat: 'plain',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
});

export function farmLog(members: readonly [PersonId, Species][], start = T0) {
  const events: FarmEvent[] = [];
  let at = start;
  const add = (kind: EventKind, actor: PersonId | null, payload: unknown) => {
    const seq = events.length + 1;
    events.push(
      FarmEvent.parse({
        seq,
        opId: `0192f1e2-3b4c-7d5e-8f60-${seq.toString(16).padStart(12, '0')}`,
        at,
        day: localDay(at, 'Europe/London'),
        rulesVersion: RULES_VERSION,
        actor,
        kind,
        payload,
      }),
    );
  };
  add('farm_created', null, {
    farm: 'f_lot',
    kind: 'farm',
    name: 'The Thursday Lot',
    land: 'meadow',
    timeZone: 'Europe/London',
    hemisphere: 'north',
  });
  members.forEach(([person, species], i) =>
    add('joined', person, {
      name: person.slice(2),
      critter: critterOf(species),
      via: i === 0 ? 'created' : 'invite',
    }),
  );
  const log = {
    add,
    wait(ms: number) {
      at += ms;
      return log;
    },
    get at() {
      return at;
    },
    state(): FarmState {
      const state = replay(events);
      if (!state) throw new Error('no farm');
      return state;
    },
  };
  return log;
}
