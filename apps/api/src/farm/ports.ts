import type {
  CommandKind,
  CommandOf,
  CottageDelivery,
  Critter,
  EpochMs,
  EventOf,
  FarmEvent,
  FarmId,
  FarmPlace,
  FarmState,
  LocalDate,
  PersonId,
  RejectReason,
  Weather,
  WeatherSource,
} from '@kithfield/contracts';

import type { Bindings } from '../env';

/** A command without its op id: what the rules check. */
export type CommandBody = {
  [K in CommandKind]: { kind: K; payload: CommandOf<K>['payload'] };
}[CommandKind];

export type FarmCreatedEvent = EventOf<'farm_created'>;

export type RuleCheck = { ok: true } | { ok: false; reason: RejectReason };

/**
 * The farm's computed view (sleepy, misty, season by the calendar). The object only passes it
 * through; its shape belongs to the rules.
 */
export type FarmView = unknown;

/** The farm rules: the pure reducer in `@kithfield/farm`, injected so the protocol can be tested alone. */
export interface FarmRules {
  readonly RULES_VERSION: number;
  createFarm(created: FarmCreatedEvent): FarmState;
  applyEvent(state: FarmState, event: FarmEvent): FarmState;
  checkCommand(state: FarmState, cmd: CommandBody, actor: PersonId, now: EpochMs): RuleCheck;
  farmView(state: FarmState, now: EpochMs): FarmView;
}

/** A person's name and critter, as drawn in `joined` and at the gate. */
export type Profile = { name: string; critter: Critter };

/** Who a socket token or a request belongs to. */
export interface Identity {
  /** The person a farm socket token was minted for, for this farm; null when it isn't valid. */
  socketPerson(env: Bindings, token: string, farm: FarmId): Promise<PersonId | null>;
  /** The signed-in person behind an HTTP request; null without a valid session. */
  requestPerson(env: Bindings, request: Request): Promise<PersonId | null>;
  /** A person's display name and critter; null for an unknown or deleted person. */
  profile(env: Bindings, person: PersonId): Promise<Profile | null>;
}

/** Hands a committed event to a member's cottage. */
export interface CottageNotifier {
  deliver(env: Bindings, person: PersonId, delivery: CottageDelivery): Promise<void>;
}

export type WeatherReading = { weather: Weather; source: WeatherSource };

/** Today's weather for the keeper's town; null when there is none to report. */
export interface WeatherProvider {
  today(env: Bindings, place: FarmPlace, day: LocalDate): Promise<WeatherReading | null>;
}

export interface Clock {
  now(): EpochMs;
}

export interface FarmPorts {
  rules: FarmRules;
  identity: Identity;
  cottage: CottageNotifier;
  weather: WeatherProvider;
  clock: Clock;
}
