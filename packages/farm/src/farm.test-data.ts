import {
  type Critter,
  type EventKind,
  type EventOf,
  type FarmEvent,
  FarmEvent as FarmEventSchema,
  FarmState,
  type FarmKind,
  type Hemisphere,
  type PersonId,
} from '@kithfield/contracts';
import { expect } from 'vitest';

import { replay } from './reducer';
import { RULES_VERSION } from './rules';
import { localDay } from './time';

/* Shared farms and logs for the farm rules tests. */

export const farm = 'f_thursday_lot';
export const bea = 'p_bea';
export const pip = 'p_pip';
export const fig = 'p_fig';
export const kit = 'p_kit';
export const otis = 'p_otis';
export const june = 'p_june';

export const critter: Critter = {
  species: 'rabbit',
  coat: 'cocoa',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
};

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** 10:00 in London on Sunday 18 October 2026: autumn in the north. */
export const T0 = Date.UTC(2026, 9, 18, 9, 0);

const opIdOf = (seq: number) => `0192f1e2-3b4c-7d5e-8f60-${seq.toString(16).padStart(12, '0')}`;

/** A farm's log, written in order the way the farm object writes it. Every event is checked. */
export interface Log {
  readonly events: FarmEvent[];
  at: number;
  /** The farm's time zone, which the farm stamps each event's `day` from. */
  timeZone: string;
  add<K extends EventKind>(kind: K, actor: PersonId | null, payload: unknown): EventOf<K>;
  wait(ms: number): Log;
  state(): FarmState;
}

export const makeLog = (start = T0): Log => {
  const log: Log = {
    events: [],
    at: start,
    timeZone: 'Europe/London',
    add(kind, actor, payload) {
      const seq = log.events.length + 1;
      const event = FarmEventSchema.parse({
        seq,
        opId: opIdOf(seq),
        at: log.at,
        day: localDay(log.at, log.timeZone),
        rulesVersion: RULES_VERSION,
        actor,
        kind,
        payload,
      });
      log.events.push(event);
      return event as EventOf<typeof kind>;
    },
    wait(ms) {
      log.at += ms;
      return log;
    },
    state() {
      const state = replay(log.events);
      if (!state) throw new Error('The log has no farm_created');
      return state;
    },
  };
  return log;
};

export interface FarmOptions {
  readonly kind?: FarmKind;
  readonly timeZone?: string;
  readonly hemisphere?: Hemisphere;
  readonly start?: number;
  readonly members?: readonly PersonId[];
}

/** A farm (or visit) with its members moved in; the first one created it. */
export const newFarm = (options: FarmOptions = {}): Log => {
  const kind = options.kind ?? 'farm';
  const log = makeLog(options.start);
  log.timeZone = options.timeZone ?? 'Europe/London';
  log.add('farm_created', null, {
    farm,
    kind,
    name: kind === 'farm' ? 'The Thursday Lot' : null,
    land: 'meadow',
    timeZone: options.timeZone ?? 'Europe/London',
    hemisphere: options.hemisphere ?? 'north',
  });
  const members = options.members ?? (kind === 'visit' ? [june, otis] : [bea, pip, fig]);
  members.forEach((person, i) =>
    log.add('joined', person, {
      name: person.slice(2),
      critter,
      via: kind === 'visit' ? 'visit' : i === 0 ? 'created' : 'invite',
    }),
  );
  return log;
};

export const plantOf = (state: FarmState, plant: string) => {
  const found = state.plants.find((p) => p.plant === plant) ?? state.pot;
  if (!found || found.plant !== plant) throw new Error(`No ${plant} on the farm`);
  return found;
};

/** The state still fits the snapshot schema, unchanged by a round trip through JSON. */
export const expectSnapshot = (state: FarmState) => {
  const parsed = FarmState.parse(JSON.parse(JSON.stringify(state)));
  expect(parsed).toEqual(state);
  return parsed;
};

/** Freezes a value all the way down, so any write to it throws. */
export const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};
