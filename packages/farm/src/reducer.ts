import {
  type EventOf,
  type FarmEvent,
  type FarmState,
  type ParsedEvent,
  isTombstone,
} from '@kithfield/contracts';

import {
  applyCardSigned,
  applyDoorstep,
  applyPin,
  applyRoseWater,
  applyUnsend,
  withoutDelivered,
} from './doorstep';
import { applyTend, careOf, factsOf } from './growth';
import { signatureFor } from './hash';
import {
  applyCritterChanged,
  applyJoined,
  applySettings,
  applyStatus,
  depart,
  updateMember,
} from './members';
import {
  applyCheckin,
  applyRsvp,
  applySeedChanged,
  applySeedPlanted,
  applyVote,
  seedOf,
} from './plans';
import { HANGOUT_DEW, RULES_VERSION } from './rules';
import {
  applyHarvested,
  applySeasonRolled,
  applySharedRainDay,
  applyTraded,
  applyWeather,
  farmDay,
  freshPlants,
  freshPot,
} from './seasons';
import { localDay, seasonOf } from './time';

export type FarmCreatedEvent = EventOf<'farm_created'>;

/** The farm as its first event (seq 1) makes it. */
export const createFarm = (created: FarmCreatedEvent): FarmState => {
  const p = created.payload;
  const day = localDay(created.at, p.timeZone);
  const season = seasonOf(day, p.hemisphere);
  const signature = p.kind === 'farm' ? signatureFor(p.farm) : null;
  return {
    farm: p.farm,
    kind: p.kind,
    name: p.kind === 'farm' ? p.name : null,
    land: p.land,
    theme: null,
    timeZone: p.timeZone,
    hemisphere: p.hemisphere,
    place: null,
    birthdaysBloom: true,
    approval: false,
    frozen: false,
    rulesVersion: created.rulesVersion,
    season,
    weather: null,
    sharedRainDay: null,
    members: [],
    former: [],
    plants: p.kind === 'farm' ? freshPlants(season, signature) : [],
    signature,
    familyTendedAt: {
      dew: null,
      words: null,
      pictures: null,
      voices: null,
      gestures: null,
      gatherings: null,
    },
    today: { day, given: [] },
    roses: [],
    pot: p.kind === 'visit' ? freshPot(season) : null,
    fieldGuide: [],
    basket: null,
    seeds: [],
    pins: [],
    doorstep: [],
    fireLitAt: null,
  };
};

/** Whether this reducer can apply the farm's rules; if not, it grows nothing rather than guess. */
export const canApplyRules = (state: FarmState): boolean => state.rulesVersion <= RULES_VERSION;

/** Kinds that grow the farm or change it, applied after the event's own bookkeeping. */
const applyKind = (state: FarmState, event: FarmEvent, day: string): FarmState => {
  switch (event.kind) {
    case 'joined':
      return applyJoined(state, event);
    case 'left': {
      const how = factsOf(event)['how'];
      return depart(state, event.actor, how === 'account_deleted' ? how : 'left', event.at);
    }
    case 'removed': {
      const person = factsOf(event)['person'];
      return typeof person === 'string' ? depart(state, person, 'removed', event.at) : state;
    }
    case 'critter_changed':
      return applyCritterChanged(state, event);
    case 'settings_changed':
      return applySettings(state, event);
    case 'farm_opened':
      return updateMember(state, event.actor, () => ({ lastOpenedAt: event.at }));
    case 'hibernate': {
      const on = factsOf(event)['on'];
      return typeof on === 'boolean'
        ? updateMember(state, event.actor, () => ({ hibernating: on }))
        : state;
    }
    case 'status':
      return applyStatus(state, event);
    case 'fire': {
      const fire = factsOf(event)['state'];
      if (fire === 'lit') return { ...state, fireLitAt: state.fireLitAt ?? event.at };
      return fire === 'out' ? { ...state, fireLitAt: null } : state;
    }
    case 'unsend':
      return applyUnsend(state, event);
    case 'pin':
      return applyPin(state, event);
    case 'dewdrop':
      return applyRoseWater(state, event, day);
    case 'card_signed':
      return applyCardSigned(state, event, day);
    case 'firefly':
    case 'gift':
    case 'slow_post':
    case 'gate':
      return applyDoorstep(state, event);
    case 'seed_planted':
      return applySeedPlanted(state, event);
    case 'seed_changed':
      return applySeedChanged(state, event);
    case 'vote':
      return applyVote(state, event);
    case 'rsvp':
      return applyRsvp(state, event);
    case 'checkin': {
      const { state: next, hangout } = applyCheckin(state, event);
      return hangout.reduce(
        (s, person) =>
          applyTend(s, {
            person,
            family: 'gatherings',
            dew: HANGOUT_DEW,
            kind: 'checkin',
            at: event.at,
            day,
          }),
        next,
      );
    }
    case 'traded':
      return applyTraded(state, event);
    case 'weather':
      return applyWeather(state, event);
    case 'shared_rain': {
      const rained = event.payload.people.reduce(
        (s, person) =>
          applyTend(s, {
            person,
            family: 'gatherings',
            dew: 1,
            kind: 'shared_rain',
            at: event.at,
            day,
          }),
        state,
      );
      return applySharedRainDay(rained, event);
    }
    case 'season_rolled':
      return applySeasonRolled(state, event);
    case 'harvested':
      return applyHarvested(state, event);
    case 'rules_changed':
      return { ...state, rulesVersion: Math.max(state.rulesVersion, event.payload.to) };
    case 'message':
    case 'edit':
    case 'reaction':
    case 'sticker':
    case 'media':
    case 'voice':
    case 'link':
    case 'wave':
    case 'knock':
    case 'hug':
    case 'quiet_note':
    case 'scrapbook_page':
    case 'farm_created':
    case 'restored':
      return state;
  }
};

/** Finds an event in the farm's log by seq: what a `restored` needs to put its target back. */
export interface EventLookup {
  readonly event?: (seq: number) => FarmEvent | undefined;
}

/**
 * Once an appeal's `restored` is applied and the target is back (paged in with its payload), this
 * puts back what the removal took off the farm: a plan seed. Growth needs nothing back, because
 * the tombstone kept its facts. Pins and doorstep items stay down.
 */
export const applyRestored = (state: FarmState, target: FarmEvent): FarmState => {
  if (target.kind !== 'seed_planted' || isTombstone(target.payload)) return state;
  if (seedOf(state, target.seq)) return state;
  const { seeds } = applySeedPlanted({ ...state, seeds: [] }, target);
  const merged = [...state.seeds, ...seeds].sort((a, b) => a.seq - b.seq).slice(-100);
  return { ...state, seeds: merged };
};

/**
 * Applies one event. Pure and deterministic: the same state and event give the same result on
 * every device, and the input is never changed. Events written under rules newer than this
 * reducer are skipped, and so is everything once the farm has moved to such rules.
 *
 * A `restored` puts its target back through `lookup`. A phone must page the restored target in
 * (with its payload back) before it applies the `restored` or anything after it; without the
 * target the restore can't be applied and the farm would differ from the server's.
 */
export const applyEvent = (
  state: FarmState,
  event: FarmEvent,
  lookup: EventLookup = {},
): FarmState => {
  if (event.kind === 'rules_changed') return applyKind(state, event, state.today.day);
  if (!canApplyRules(state) || event.rulesVersion > RULES_VERSION) return state;
  if (event.kind === 'farm_created') return state;
  const day = farmDay(state, event.at);
  let next: FarmState = day === state.today.day ? state : { ...state, today: { day, given: [] } };
  next = withoutDelivered(next, event.at);
  if (event.kind === 'restored') {
    const target = lookup.event?.(event.payload.target);
    return target ? applyRestored(next, target) : next;
  }
  const care = event.actor === null ? null : careOf(event);
  if (care && event.actor !== null) {
    next = applyTend(next, { person: event.actor, ...care, kind: event.kind, at: event.at, day });
  }
  return applyKind(next, event, day);
};

/** Applies a received event as `parseEvent` sorted it: unknown and invalid events are skipped. */
export const applyParsed = (
  state: FarmState,
  parsed: ParsedEvent,
  lookup: EventLookup = {},
): FarmState => (parsed.status === 'known' ? applyEvent(state, parsed.event, lookup) : state);

/**
 * Applies events in order. A `restored` finds its target among the given events first, then
 * through `lookup` (for a target before this batch, such as one inside a snapshot).
 */
export const reduce = (
  state: FarmState,
  events: Iterable<FarmEvent>,
  lookup: EventLookup = {},
): FarmState => {
  const list = [...events];
  const bySeq = new Map(list.map((e) => [e.seq, e]));
  const find: EventLookup = { event: (seq) => bySeq.get(seq) ?? lookup.event?.(seq) };
  let next = state;
  for (const event of list) next = applyEvent(next, event, find);
  return next;
};

/**
 * Builds a farm from its whole log, starting at `farm_created` (seq 1). Null if the log doesn't
 * start with one.
 */
export const replay = (events: readonly FarmEvent[]): FarmState | null => {
  const [first, ...rest] = events;
  return first?.kind === 'farm_created' ? reduce(createFarm(first), rest) : null;
};
