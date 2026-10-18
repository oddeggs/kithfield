import type {
  EventOf,
  FarmCommand,
  FarmEvent,
  FarmState,
  PersonId,
  RejectReason,
} from '@kithfield/contracts';

/**
 * The farm rules the sync engine runs: the shared reducer from `@kithfield/farm`, injected so the
 * engine never depends on its internals. The app passes the real reducer; tests pass their own.
 */
export interface FarmRules<View = unknown> {
  /** The highest farm rules version this reducer implements, sent in `hello`. */
  readonly RULES_VERSION: number;
  /** The farm as seq 1 (`farm_created`) leaves it. */
  createFarm(created: EventOf<'farm_created'>): FarmState;
  /** The farm after one more event. Pure. */
  applyEvent(state: FarmState, event: FarmEvent): FarmState;
  /** Why the farm would refuse this write now, or null when it would take it. */
  checkCommand(
    state: FarmState,
    cmd: FarmCommand,
    actor: PersonId,
    now: number,
  ): RejectReason | null;
  /** What the farm looks like at `now`: sleepy, misty and the rest are computed, never stored. */
  farmView(state: FarmState, now: number): View;
}
