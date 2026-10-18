import {
  type ArtId,
  type CommandResult,
  type Crop,
  type FarmEvent,
  type FarmGate,
  type FarmId,
  type FarmKind,
  type FarmState,
  type GateGesture,
  type Hemisphere,
  LIMITS,
  type OpId,
  type PersonId,
  type TimeZone,
  type TradedPayload,
} from '@kithfield/contracts';

import { isKnownTimeZone, seasonDays } from '@kithfield/farm';

import { addWaiting, insertFarm } from './d1';
import { cottage } from './adapters/cottage';
import { cottageFarmFor } from './handoff';
import type { FarmHost } from './host';
import { attachmentOf, refuse } from './sockets';
import type { Profile } from './ports';

/* The writes the farm makes on someone's behalf: planting it, joining, the gate and trades. */

export type CreateInput = {
  farm: FarmId;
  kind: FarmKind;
  name: string | null;
  land: ArtId;
  timeZone: TimeZone;
  hemisphere: Hemisphere;
  keeper: PersonId | null;
  /** The two people of a visit, sorted and joined with ':'. */
  pair: string | null;
  members: { person: PersonId; profile: Profile; via: 'created' | 'visit' }[];
};

/** Plants the farm: `farm_created` at seq 1, then each first member's `joined`. Safe to repeat. */
export const createFarm = async (host: FarmHost, input: CreateInput): Promise<void> => {
  if (!isKnownTimeZone(input.timeZone)) throw new Error('The farm’s time zone is unknown');
  const now = host.now();
  await insertFarm(host.env.DB, {
    id: input.farm,
    kind: input.kind,
    name: input.name,
    land: input.land,
    keeper: input.keeper,
    pair: input.pair,
    at: now,
  });
  const events: FarmEvent[] = [];
  if (host.farm.state === null) {
    const { farm, kind, name, land, timeZone, hemisphere } = input;
    const created = host.farm.write(
      null,
      'farm_created',
      { farm, kind, name, land, timeZone, hemisphere },
      now,
    );
    if (created === null) throw new Error('The farm could not be created');
    events.push(created);
  }
  for (const { person, profile, via } of input.members) {
    if (host.farm.state?.members.some((m) => m.person === person) === true) continue;
    const joined = host.farm.write(person, 'joined', { ...profile, via }, now);
    if (joined === null) throw new Error('A first member could not join');
    events.push(joined);
  }
  host.publish(events);
  await host.settle(events);
};

export type JoinOutcome =
  { status: 'joined' | 'waiting_for_keeper' } | { error: 'not_found' | 'farm_full' | 'forbidden' };

/** Joins through an invite, or waits for a keeper on a farm that asks. */
export const joinFarm = async (
  host: FarmHost,
  person: PersonId,
  profile: Profile,
  approved: boolean,
): Promise<JoinOutcome> => {
  const state = host.farm.state;
  if (state === null || state.kind === 'visit') return { error: 'not_found' };
  if (state.members.some((m) => m.person === person)) return { status: 'joined' };
  if (state.frozen) return { error: 'forbidden' };
  if (state.members.length >= LIMITS.members) return { error: 'farm_full' };
  if (state.approval && !approved) {
    await addWaiting(host.env.DB, state.farm, person, profile, host.now());
    return { status: 'waiting_for_keeper' };
  }
  const joined = host.farm.write(person, 'joined', { ...profile, via: 'invite' }, host.now());
  if (joined === null) return { error: 'forbidden' };
  host.publish([joined]);
  await host.settle([joined]);
  return { status: 'joined' };
};

/** What a visitor from another farm sees at the gate. Visits have no gate. */
export const gateView = (host: FarmHost): FarmGate | null => {
  const state = host.farm.state;
  if (state === null || state.kind === 'visit' || state.name === null) return null;
  return {
    farm: state.farm,
    name: state.name,
    land: state.land,
    theme: state.theme,
    hemisphere: state.hemisphere,
    season: state.season,
    signature: state.signature,
    inSeason: state.plants.map((p) => p.plant).slice(0, 7),
    critters: state.members.flatMap(({ person, name, critter }) =>
      name === null ? [] : [{ person, name, critter }],
    ),
  };
};

const finish = async (
  host: FarmHost,
  written: { result: CommandResult; event: FarmEvent | null },
) => {
  if (written.event !== null) {
    host.publish([written.event]);
    await host.settle([written.event]);
  }
  return written.result;
};

/** A visitor's wave, firefly or gift at the gate, written with the visitor as actor. */
export const atGate = (
  host: FarmHost,
  visitor: PersonId,
  profile: Profile,
  opId: OpId,
  gesture: GateGesture,
) =>
  finish(
    host,
    host.farm.once(opId, host.now(), () => {
      const state = host.farm.state;
      if (state === null || state.kind === 'visit') return 'not_found';
      const members = new Set(state.members.map((m) => m.person));
      if (members.has(visitor)) return 'not_allowed';
      if (state.frozen) return 'farm_frozen';
      if ('to' in gesture && !members.has(gesture.to)) return 'not_found';
      return { actor: visitor, kind: 'gate', payload: { visitor: profile, gesture } };
    }),
  );

/** A crop in this season's basket, rare variant and all. */
export const basketCrop = (host: FarmHost, plant: string): Crop | null =>
  host.farm.state?.basket?.crops.find((c) => c.plant === plant) ?? null;

/** One side of a trade: written once per op id, and once a season between two farms. */
export const recordTrade = (host: FarmHost, opId: OpId, actor: PersonId, payload: TradedPayload) =>
  finish(
    host,
    host.farm.once(opId, host.now(), () => {
      const state = host.farm.state;
      if (state === null) return 'not_found';
      if (!state.members.some((m) => m.person === actor)) return 'not_found';
      const first = seasonDays(state.season, state.hemisphere).first;
      const traded = host.store
        .kindSince('traded', 0)
        .filter((e) => e.day !== undefined && e.day >= first)
        .some((e) => (e.payload as { otherFarm?: string }).otherFarm === payload.otherFarm);
      if (traded) return 'limit_reached';
      return { actor, kind: 'traded', payload };
    }),
  );

/** Hibernation, written on every farm the person lives on, only when it changes. */
export const setHibernating = async (
  host: FarmHost,
  person: PersonId,
  on: boolean,
): Promise<void> => {
  const actor = host.farm.actorOf(person);
  const member = host.farm.state?.members.find((m) => m.person === actor);
  if (member === undefined || member.hibernating === on) return;
  const event = host.farm.write(actor, 'hibernate', { on }, host.now());
  if (event === null) return;
  host.publish([event]);
  await host.settle([event]);
};

/** The farm's state with `from` read as `into`; if both lived here, `into`'s entry stays. */
const movePerson = (state: FarmState, from: PersonId, into: PersonId): FarmState => {
  const both = state.members.some((m) => m.person === into);
  const trimmed: FarmState = both
    ? { ...state, members: state.members.filter((m) => m.person !== from) }
    : state;
  return JSON.parse(
    JSON.stringify(trimmed).replaceAll(JSON.stringify(from), JSON.stringify(into)),
  ) as FarmState;
};

/**
 * A `person_merged` job: the farm reads `from` as `into` from now on (past events keep their
 * actor), moves `from`'s place in the snapshot to `into`, closes `from`'s sockets so the phone
 * says hello again as `into`, and refreshes everyone's chat-list row. Safe to repeat.
 */
export const mergePerson = async (
  host: FarmHost,
  from: PersonId,
  into: PersonId,
): Promise<void> => {
  host.ctx.storage.transactionSync(() => host.store.addAlias(from, into));
  const state = host.farm.state;
  if (state !== null) host.farm.replaceState(movePerson(state, from, into));
  for (const ws of host.sockets()) if (attachmentOf(ws).person === from) refuse(ws, 'unauthorized');
  const after = host.farm.state;
  if (after === null) return;
  await Promise.all(
    after.members.map(async ({ person }) => {
      const row = cottageFarmFor(after, person);
      if (row !== null) await cottage.upsertFarm(host.env, person, row).catch(() => undefined);
    }),
  );
};
