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
  type RejectReason,
  type TimeZone,
  type TradedPayload,
} from '@kithfield/contracts';

import { isKnownTimeZone } from '@kithfield/farm';

import { addWaiting, insertFarm } from './d1';
import { cottage } from './adapters/cottage';
import { cottageFarmFor } from './handoff';
import type { FarmHost } from './host';
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
export const gateView = (host: FarmHost, visitor: PersonId): FarmGate | null => {
  const state = host.farm.state;
  if (state === null || state.kind === 'visit' || state.name === null) return null;
  if (wasRemoved(host, visitor)) return null;
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
/** Whether the safety team or a keeper removed this person from the farm: they never visit. */
export const wasRemoved = (host: FarmHost, person: PersonId): boolean => {
  const ids = new Set(host.store.idsOf(host.farm.actorOf(person)));
  return host.farm.state?.former.some((f) => f.how === 'removed' && ids.has(f.person)) === true;
};

/**
 * A visitor's wave, firefly or gift at the gate, written with the visitor as actor: one a farm day,
 * never from someone removed from this farm. Who may visit at all is checked by the route.
 */
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
      const actor = host.farm.actorOf(visitor);
      const members = new Set(state.members.map((m) => m.person));
      if (members.has(actor) || wasRemoved(host, actor)) return 'not_allowed';
      if (state.frozen) return 'farm_frozen';
      if ('to' in gesture && !members.has(gesture.to)) return 'not_found';
      const today = host.ports().rules.farmDay(state, host.now());
      if (host.store.gatedOn(actor, today)) return 'limit_reached';
      return { actor, kind: 'gate', payload: { visitor: profile, gesture } };
    }),
  );

/** A crop in this season's basket, rare variant and all. */
export const basketCrop = (host: FarmHost, plant: string): Crop | null =>
  host.farm.state?.basket?.crops.find((c) => c.plant === plant) ?? null;

/** Two farms trade at most once in this many days, whatever the hemisphere. */
export const TRADE_EVERY_DAYS = 90;

/** Why a trade with `otherFarm` can't be written here now, or null. Writes nothing. */
export const canTrade = (
  host: FarmHost,
  otherFarm: FarmId,
  actor: PersonId,
): RejectReason | null => {
  const state = host.farm.state;
  if (state === null) return 'not_found';
  if (!state.members.some((m) => m.person === host.farm.actorOf(actor))) return 'not_found';
  return host.store.tradedWith(otherFarm, host.now(), TRADE_EVERY_DAYS) ? 'limit_reached' : null;
};

/** The other farm's half of a trade, owed until it lands there. */
export type TradeHalf = { farm: FarmId; actor: PersonId; payload: TradedPayload };

/**
 * One side of a trade, written once per op id. The visited farm writes first and, in the same
 * transaction, owes the visitor's farm its half until `tradeHalfDone`; its alarm retries a half
 * that never landed, so a trade is never left written on one farm only.
 */
export const recordTrade = (
  host: FarmHost,
  opId: OpId,
  actor: PersonId,
  payload: TradedPayload,
  half?: TradeHalf,
) =>
  finish(
    host,
    host.farm.once(
      opId,
      host.now(),
      () =>
        canTrade(host, payload.otherFarm, actor) ?? {
          actor: host.farm.actorOf(actor),
          kind: 'traded',
          payload,
        },
      () => {
        if (half !== undefined) {
          host.store.owesTradeHalf({
            opId,
            otherFarm: half.farm,
            actor: half.actor,
            payload: half.payload,
          });
        }
      },
    ),
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
const RANK = { critter: 0, helper: 1, keeper: 2 } as const;

/**
 * The farm's state with `from` read as `into`. If both lived here, `into`'s entry stays with the
 * higher of their two roles, so a farm never loses its keeper to a merge.
 */
const movePerson = (state: FarmState, from: PersonId, into: PersonId): FarmState => {
  const old = state.members.find((m) => m.person === from);
  const kept = state.members.find((m) => m.person === into);
  const trimmed: FarmState =
    old !== undefined && kept !== undefined
      ? {
          ...state,
          members: state.members
            .filter((m) => m.person !== from)
            .map((m) =>
              m.person === into && RANK[old.role] > RANK[m.role] ? { ...m, role: old.role } : m,
            ),
        }
      : state;
  return JSON.parse(
    JSON.stringify(trimmed).replaceAll(JSON.stringify(from), JSON.stringify(into)),
  ) as FarmState;
};

/**
 * A `person_merged` job: the farm reads `from` as `into` from now on (past events keep their
 * actor) and moves `from`'s place in the snapshot to `into`. Every phone holding the farm below
 * this point takes the moved snapshot: all sockets close with `unauthorized`, so each says hello
 * again. Then everyone's chat-list row is refreshed. Safe to repeat.
 */
export const mergePerson = async (
  host: FarmHost,
  from: PersonId,
  into: PersonId,
): Promise<void> => {
  const state = host.farm.state;
  const alongside = () => {
    host.store.addAlias(from, into);
    host.store.setResyncBelow(host.farm.head + 1);
  };
  if (state === null) host.ctx.storage.transactionSync(alongside);
  else host.farm.replaceState(movePerson(state, from, into), alongside);
  host.closeSockets(null, 'unauthorized');
  const after = host.farm.state;
  if (after === null) return;
  await Promise.all(
    after.members.map(async ({ person }) => {
      const row = cottageFarmFor(after, person);
      if (row !== null) await cottage.upsertFarm(host.env, person, row).catch(() => undefined);
    }),
  );
};
