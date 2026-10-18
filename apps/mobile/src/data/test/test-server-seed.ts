import {
  FarmEvent,
  isTombstone,
  tombstoneOf,
  type FarmCommand,
  type FarmState,
} from '@kithfield/contracts';

import type { FarmRules } from '../farm-rules';
import type { ServerEnd } from './test-sockets';

/* The test server's records and seeds: its sockets, a new farm's first event, test critters. */

export interface TestFarm {
  readonly farm: string;
  /** The log as the wire carries it; may hold events the strict schema rejects. */
  readonly log: Record<string, unknown>[];
  state: FarmState;
  rulesVersion: number;
  readonly members: Set<string>;
  readonly outcomes: Map<string, { seq: number } | { reason: string }>;
  /** Events an unsend tombstoned, kept so a restore can bring them back. */
  readonly originals: Map<number, FarmEvent>;
}

/** One socket on the test server. */
export interface Session {
  readonly end: ServerEnd;
  person: string | null;
  farm: string | null;
  /** The person a cottage socket's URL names. */
  cottage?: string;
  here?: boolean;
  /** Hears nothing more from the farm, as when the network goes mid-answer. */
  silenced?: boolean;
}

/** The farm-time day of an instant; test farms keep UTC days. */
export const farmDay = (at: number) => new Date(at).toISOString().slice(0, 10);

let opCounter = 0;

/** A server-minted op id for events the farm writes itself (UUIDv7-shaped). */
export const farmOpId = () => {
  opCounter += 1;
  return `01900000-0000-7000-8000-${opCounter.toString(16).padStart(12, '0')}`;
};

export const TEST_CRITTER = {
  species: 'rabbit',
  coat: 'cocoa',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
} as const;

/** A farm holding only its `farm_created` event. */
export function seedFarm(
  rules: FarmRules<unknown>,
  farm: string,
  name: string,
  at: number,
): TestFarm {
  const created = FarmEvent.parse({
    seq: 1,
    opId: farmOpId(),
    at,
    day: farmDay(at),
    rulesVersion: rules.RULES_VERSION,
    actor: null,
    kind: 'farm_created',
    payload: {
      farm,
      kind: 'farm',
      name,
      land: 'meadow',
      timeZone: 'Europe/London',
      hemisphere: 'north',
    },
  });
  if (created.kind !== 'farm_created') throw new Error('unreachable');
  return {
    farm,
    log: [created],
    state: rules.createFarm(created),
    rulesVersion: rules.RULES_VERSION,
    members: new Set(),
    outcomes: new Map(),
    originals: new Map(),
  };
}

/** What the farm adds to a command when it writes the event. */
export function writtenPayload(cmd: FarmCommand, now: number): unknown {
  if (cmd.kind === 'unsend') return { ...cmd.payload, by: 'author' };
  if (cmd.kind === 'left') return { how: 'left' };
  if (cmd.kind === 'removed') return { ...cmd.payload, by: 'keeper' };
  if (cmd.kind === 'slow_post') return { ...cmd.payload, deliverAt: now + 3_600_000 };
  return cmd.payload;
}

/** A strictly valid event of a test farm's log by seq. */
export function eventAt(f: TestFarm, seq: number): FarmEvent | undefined {
  const parsed = FarmEvent.safeParse(f.log[seq - 1]);
  return parsed.success ? parsed.data : undefined;
}

/** Like the farm: an unsend tombstones its target in the log, and a restore brings it back. */
export function followLog(f: TestFarm, event: FarmEvent): void {
  if (event.kind === 'unsend' && !isTombstone(event.payload)) {
    const target = eventAt(f, event.payload.target);
    if (!target) return;
    f.originals.set(target.seq, target);
    const kind = event.payload.by === 'safety' ? 'removed' : 'unsent';
    f.log[target.seq - 1] = { ...target, payload: tombstoneOf(target, kind) };
  } else if (event.kind === 'restored') {
    const original = f.originals.get(event.payload.target);
    if (original) f.log[original.seq - 1] = original;
  }
}
