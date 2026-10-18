import {
  type CottageDelivery,
  type CottageFarm,
  type FarmEvent,
  type FarmState,
  isTombstone,
  type PersonId,
} from '@kithfield/contracts';

import type { Bindings } from '../env';
import { cottage } from './adapters/cottage';
import { isForYou, previewOf } from './content';

/*
 * What each member's cottage hears from the farm: its row in the chat list (on joining, a rename,
 * a visit peer's change), leaving, and every committed event. Failures are logged, never thrown:
 * a cottage that missed a row fills it in from D1 on its next delivery.
 */

/** The farm's row in a member's chat list; null for a visit whose peer has gone. */
export const cottageFarmFor = (state: FarmState, person: PersonId): CottageFarm | null => {
  if (state.kind === 'farm') {
    return { farm: state.farm, farmKind: 'farm', name: state.name, with: null };
  }
  const peer = state.members.find((m) => m.person !== person);
  if (peer === undefined) return null;
  return {
    farm: state.farm,
    farmKind: 'visit',
    name: null,
    with: { person: peer.person, name: peer.name, critter: peer.critter },
  };
};

/** Who left with an event: their cottage drops the row, their sockets close. */
export const departed = (event: FarmEvent): PersonId | null => {
  if (event.kind === 'left') return event.actor;
  if (event.kind === 'removed' && !isTombstone(event.payload)) return event.payload.person;
  return null;
};

/** Whose rows change with an event: the joiner on a farm, everyone on a rename or a visit change. */
const rowsChangedBy = (state: FarmState, event: FarmEvent): PersonId[] => {
  const everyone = state.members.map((m) => m.person);
  if (event.kind === 'joined') {
    return state.kind === 'visit' ? everyone : event.actor === null ? [] : [event.actor];
  }
  if (event.kind === 'settings_changed' && !isTombstone(event.payload)) {
    return event.payload.setting === 'name' ? everyone : [];
  }
  return state.kind === 'visit' && event.kind === 'critter_changed' ? everyone : [];
};

/** Runs one cottage call; false (logged) if it failed. */
const attempt = async (what: string, work: Promise<unknown>): Promise<boolean> => {
  try {
    await work;
    return true;
  } catch (error) {
    console.warn(`cottage ${what} failed`, {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
};

/**
 * The news of a run of committed events for every member's cottage: rows first (joining,
 * renames, leaving), then deliveries. In a burst each member hears every event meant for them,
 * and of the rest only the newest, which is all the chat list shows. Returns the seqs whose news
 * didn't fully land, for a retry.
 */
export const handOff = async (
  env: Bindings,
  state: FarmState,
  events: readonly FarmEvent[],
  open: ReadonlySet<PersonId>,
  repliedTo: (event: FarmEvent) => PersonId | null,
): Promise<Set<number>> => {
  const failed = new Set<number>();
  for (const event of events) {
    const work: Promise<boolean>[] = [];
    for (const person of rowsChangedBy(state, event)) {
      const row = cottageFarmFor(state, person);
      if (row !== null) work.push(attempt('upsertFarm', cottage.upsertFarm(env, person, row)));
    }
    const gone = departed(event);
    if (gone !== null) work.push(attempt('leaveFarm', cottage.leaveFarm(env, gone, state.farm)));
    if ((await Promise.all(work)).includes(false)) failed.add(event.seq);
  }
  await Promise.all(
    state.members.map(async ({ person }) => {
      const news = events.map((event) => ({
        event,
        forYou: isForYou(event, person, repliedTo(event)),
      }));
      const newest = news.at(-1)?.event.seq;
      for (const { event, forYou } of news) {
        if (!forYou && event.seq !== newest) continue;
        const delivery: CottageDelivery = {
          farm: state.farm,
          seq: event.seq,
          kind: event.kind,
          actor: event.actor,
          at: event.at,
          preview: previewOf(event),
          forYou,
          connected: open.has(person),
        };
        if (!(await attempt('delivery', cottage.deliver(env, person, delivery)))) {
          failed.add(event.seq);
        }
      }
    }),
  );
  return failed;
};
