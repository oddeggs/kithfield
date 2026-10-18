import type {
  EventEnvelope,
  EventOf,
  FarmCommand,
  FarmEvent,
  FarmState,
  PersonId,
  RejectReason,
} from '@kithfield/contracts';
import {
  RULES_VERSION,
  applyEvent,
  checkCommand,
  createFarm,
  farmView,
  type FarmView,
} from '@kithfield/farm';

/** Finds an event of the farm's log by seq, synchronously; undefined when the phone lacks it. */
export type EventFinder = (seq: number) => FarmEvent | undefined;

export type CommandCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: RejectReason };

/**
 * The farm rules the sync engine runs: the shared reducer from `@kithfield/farm`, behind a port
 * so tests can see exactly what the engine asks of it.
 */
export interface FarmRules<View = unknown> {
  /** The highest farm rules version this reducer implements, sent in `hello`. */
  readonly RULES_VERSION: number;
  /** The farm as seq 1 (`farm_created`) leaves it. */
  createFarm(created: EventOf<'farm_created'>): FarmState;
  /**
   * The farm after one more event. Pure. A `restored` finds its target through `lookup`, so the
   * target must be paged back in (with its payload) before the `restored` is applied.
   */
  applyEvent(state: FarmState, event: FarmEvent, lookup?: { event?: EventFinder }): FarmState;
  /** Whether the farm would take this write now; `context.event` finds the events it points at. */
  checkCommand(
    state: FarmState,
    cmd: FarmCommand,
    actor: PersonId,
    now: number,
    context?: {
      event?: (seq: number) => FarmEvent | EventEnvelope | undefined;
      /** Friends the actor has already knocked for today, farm time. */
      knockedToday?: readonly PersonId[];
    },
  ): CommandCheck;
  /** What the farm looks like at `now`: sleepy, misty and the rest are computed, never stored. */
  farmView(state: FarmState, now: number): View;
}

/** The farm rules every phone runs: `@kithfield/farm`. */
export const kithfieldRules: FarmRules<FarmView> = {
  RULES_VERSION,
  createFarm,
  applyEvent: (state, event, lookup) => applyEvent(state, event, lookup),
  checkCommand: (state, cmd, actor, now, context) => checkCommand(state, cmd, actor, now, context),
  farmView,
};
