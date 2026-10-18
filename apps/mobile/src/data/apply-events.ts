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

import type { EventFinder, FarmRules } from './farm-rules';
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
    }
  /** A frame of a known type that failed its schema; the socket was dropped. */
  | {
      readonly type: 'bad_frame';
      readonly socket: 'farm' | 'cottage';
      readonly frame: string;
      readonly issues: readonly EventIssuePath[];
    }
  /** The local store was emptied: its key was gone, or the file wasn't a database. */
  | { readonly type: 'store_reset'; readonly reason: 'key_missing' | 'not_a_database' }
  /** Writes still waiting when the person signed out. */
  | { readonly type: 'unsent_at_sign_out'; readonly count: number }
  /** Background work that failed; `where` names it, `error` is the error's name only. */
  | { readonly type: 'failed'; readonly where: string; readonly error: string };

/** A report for a failure caught in background work: the error's name, never its message. */
export const failure = (where: string, error: unknown): SyncReport => ({
  type: 'failed',
  where,
  error:
    typeof (error as { name?: unknown })?.name === 'string' ? (error as Error).name : typeof error,
});

export interface BatchOutcome {
  /**
   * `from_last`: events arrived past a gap, so say `hello` again from `lastSeq`. `snapshot`: an
   * event was invalid (or the phone has no state to apply to), so say `hello` with `lastSeq: 0`.
   */
  readonly resync?: 'from_last' | 'snapshot';
  /** An event under farm rules newer than this app: the app needs an update. */
  readonly rulesOutdated?: boolean;
  /**
   * A `restored` arrived whose target the phone holds only as a tombstone: page these seqs back
   * in, then say `hello` again; the reducer applies the restore with the target back.
   */
  readonly restore?: readonly number[];
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
  /** Recent events of the farm by seq, from the replica's memory. */
  readonly find: EventFinder;
  /** Keeps an event in that memory. */
  readonly remember: (event: FarmEvent) => void;
  /** Restore targets already paged in once: a restore of one still missing goes ahead without. */
  readonly tried: ReadonlySet<number>;
}

/** The target's payload is back, so the reducer can apply its restore. */
const usable = (event: FarmEvent | undefined): event is FarmEvent =>
  event !== undefined && !isTombstone(event.payload);

/** Replaces a cached event's payload with its tombstone, keeping the facts the reducer reads. */
async function tombstone(ctx: Context, e: StoredEvent, kind: Tombstone['tombstone']) {
  if (isTombstone(e.payload) || e.kind === 'settings_changed') return;
  const parsed = FarmEvent.safeParse(e);
  const payload: Tombstone = parsed.success ? tombstoneOf(parsed.data, kind) : { tombstone: kind };
  await ctx.store.setPayload(ctx.farm, e.seq, payload);
  if (parsed.success) ctx.remember({ ...parsed.data, payload } as FarmEvent);
}

/** What an event does to the cached log besides being stored: unsends and deleted accounts. */
async function cacheEffects(ctx: Context, event: FarmEvent) {
  if (isTombstone(event.payload)) return;
  if (event.kind === 'unsend') {
    const target = await ctx.store.event(ctx.farm, event.payload.target);
    if (target) await tombstone(ctx, target, event.payload.by === 'safety' ? 'removed' : 'unsent');
  } else if (event.kind === 'left' && event.payload.how === 'account_deleted' && event.actor) {
    for (const e of await ctx.store.eventsBy(ctx.farm, event.actor)) {
      if (e.seq < event.seq) await tombstone(ctx, e, 'author_deleted');
    }
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
  const restore: number[] = [];
  const batch = new Map<number, FarmEvent>();
  const lookup = { event: (seq: number) => batch.get(seq) ?? ctx.find(seq) };
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
    if (known.kind === 'restored' && !isTombstone(known.payload)) {
      const target = known.payload.target;
      if (!usable(lookup.event(target)) && !ctx.tried.has(target)) {
        restore.push(target);
        break;
      }
    }
    try {
      if (state) state = ctx.rules.applyEvent(state, known, lookup);
      else if (known.kind === 'farm_created') state = ctx.rules.createFarm(known);
      else wantSnapshot();
    } catch {
      // The farm here can't be trusted past this event: stop, and take the snapshot.
      ctx.report({ type: 'reducer_failed', farm: ctx.farm, seq: known.seq, kind: known.kind });
      wantSnapshot();
      break;
    }
    await ctx.store.putEvent(ctx.farm, { ...known, known: true });
    await cacheEffects(ctx, known);
    batch.set(known.seq, known);
    ctx.remember(known);
    if (pendingOps.has(known.opId)) seen.add(known.opId);
    lastSeq = known.seq;
  }

  return {
    record: { lastSeq, state, needsSnapshot },
    outcome: {
      ...(resync ? { resync } : {}),
      ...(rulesOutdated ? { rulesOutdated } : {}),
      ...(restore.length > 0 ? { restore } : {}),
    },
    seen,
  };
}

/**
 * Stores a history page (events behind `lastSeq`), sorted like live events but without the
 * reducer: what it holds is already in the farm, or (a restore's target) is applied with the
 * `restored` that comes next.
 */
export async function storeHistory(
  ctx: Context,
  lastSeq: number,
  events: readonly unknown[],
): Promise<void> {
  for (const raw of events) {
    const parsed = parseEvent(raw);
    const seq = parsed.status === 'invalid' ? parsed.seq : parsed.event.seq;
    if (seq === null || seq > lastSeq) continue;
    if (parsed.status === 'invalid') {
      await ctx.store.putInvalid(ctx.farm, parsed, ctx.now());
      continue;
    }
    await ctx.store.putEvent(ctx.farm, { ...parsed.event, known: parsed.status === 'known' });
    if (parsed.status === 'known') ctx.remember(parsed.event);
  }
}
