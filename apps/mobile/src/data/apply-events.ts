import {
  FarmEvent,
  isTombstone,
  parseEvent,
  tombstoneOf,
  type EventIssuePath,
  type FarmId,
  type FarmState,
  type Tombstone,
} from '@kithfield/contracts';

import type { FarmRules } from './farm-rules';
import type { StoredEvent, SyncStore } from './sync-store';

/** Problems the sync engine reports. They carry kinds, seqs and paths, never content. */
export type SyncReport =
  | {
      readonly type: 'invalid_event';
      readonly farm: FarmId;
      readonly seq: number | null;
      readonly kind: string | null;
      readonly issues: readonly EventIssuePath[];
    }
  | {
      readonly type: 'reducer_failed';
      readonly farm: FarmId;
      readonly seq: number;
      readonly kind: string;
    };

export interface BatchOutcome {
  /**
   * `from_last`: events arrived past a gap, so say `hello` again from `lastSeq`. `snapshot`: an
   * event was invalid (or the phone has no state to apply to), so say `hello` with `lastSeq: 0`.
   */
  readonly resync?: 'from_last' | 'snapshot';
  /** An event under farm rules newer than this app: the app needs an update. */
  readonly rulesOutdated?: boolean;
  /** Events an appeal restored, to page back in. */
  readonly restored?: readonly number[];
}

export interface ReplicaRecord {
  readonly lastSeq: number;
  readonly state: FarmState | null;
  readonly needsSnapshot: boolean;
}

interface Context {
  readonly store: SyncStore;
  readonly farm: FarmId;
  readonly rules: FarmRules<unknown>;
  readonly report: (report: SyncReport) => void;
  readonly now: () => number;
}

/** Replaces a cached event's payload with its tombstone, keeping the facts the reducer reads. */
async function tombstone(ctx: Context, e: StoredEvent, kind: Tombstone['tombstone']) {
  if (isTombstone(e.payload) || e.kind === 'settings_changed') return;
  const parsed = FarmEvent.safeParse(e);
  const payload: Tombstone = parsed.success ? tombstoneOf(parsed.data, kind) : { tombstone: kind };
  await ctx.store.setPayload(ctx.farm, e.seq, payload);
}

/** What an event does to the cached log besides being stored: unsends and deleted accounts. */
async function cacheEffects(ctx: Context, event: FarmEvent, restored: number[]) {
  if (isTombstone(event.payload)) return;
  if (event.kind === 'unsend') {
    const target = await ctx.store.event(ctx.farm, event.payload.target);
    if (target) await tombstone(ctx, target, event.payload.by === 'safety' ? 'removed' : 'unsent');
  } else if (event.kind === 'left' && event.payload.how === 'account_deleted' && event.actor) {
    for (const e of await ctx.store.eventsBy(ctx.farm, event.actor)) {
      if (e.seq < event.seq) await tombstone(ctx, e, 'author_deleted');
    }
  } else if (event.kind === 'restored') {
    restored.push(event.payload.target);
  }
}

/**
 * Applies received events in seq order on top of `record`, storing each one. Each event sorts
 * three ways (`parseEvent`): a known one runs through the reducer; an unknown kind is stored and
 * skipped; an invalid one is stored raw and reported, and the farm's snapshot is wanted. All three
 * move `lastSeq` past themselves. Events the phone already holds are skipped; a gap stops the
 * batch so the connection can ask again.
 */
export async function applyEnvelopes(
  ctx: Context,
  start: ReplicaRecord,
  events: readonly unknown[],
  pendingOps: ReadonlySet<string>,
): Promise<{ record: ReplicaRecord; outcome: BatchOutcome; seen: Set<string> }> {
  let { lastSeq, state, needsSnapshot } = start;
  const seen = new Set<string>();
  const restored: number[] = [];
  let resync: BatchOutcome['resync'];
  let rulesOutdated = false;
  const wantSnapshot = () => {
    needsSnapshot = true;
    resync = 'snapshot';
  };

  for (const raw of events) {
    const parsed = parseEvent(raw);
    const seq = parsed.status === 'invalid' ? parsed.seq : parsed.event.seq;
    if (seq !== null && seq <= lastSeq) continue;
    if (seq !== null && seq !== lastSeq + 1) {
      resync ??= 'from_last';
      break;
    }

    if (parsed.status === 'invalid') {
      ctx.report({
        type: 'invalid_event',
        farm: ctx.farm,
        seq,
        kind: parsed.kind,
        issues: parsed.issues,
      });
      await ctx.store.putInvalid(ctx.farm, parsed, ctx.now());
      wantSnapshot();
      // Without a seq there is nothing to step past: the snapshot sets the place.
      if (seq === null) break;
      lastSeq = seq;
      continue;
    }

    const event = parsed.event;
    if (parsed.status === 'unknown') {
      await ctx.store.putEvent(ctx.farm, { ...event, known: false });
      lastSeq = event.seq;
      continue;
    }

    const known = parsed.event;
    if (known.rulesVersion > ctx.rules.RULES_VERSION) {
      rulesOutdated = true;
      break;
    }
    try {
      if (state) state = ctx.rules.applyEvent(state, known);
      else if (known.kind === 'farm_created') state = ctx.rules.createFarm(known);
      else wantSnapshot();
    } catch {
      ctx.report({ type: 'reducer_failed', farm: ctx.farm, seq: known.seq, kind: known.kind });
      wantSnapshot();
    }
    await ctx.store.putEvent(ctx.farm, { ...known, known: true });
    await cacheEffects(ctx, known, restored);
    if (pendingOps.has(known.opId)) seen.add(known.opId);
    lastSeq = known.seq;
  }

  return {
    record: { lastSeq, state, needsSnapshot },
    outcome: {
      ...(resync ? { resync } : {}),
      ...(rulesOutdated ? { rulesOutdated } : {}),
      ...(restored.length > 0 ? { restored } : {}),
    },
    seen,
  };
}
