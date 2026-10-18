import type { FarmId, OpId, PersonId, SeedPlantedPayload } from '@kithfield/contracts';

import type { DataClient, EnqueueResult } from '../../data';

/*
 * The planter's own "in". An answer names the plan by its seq, which only the farm gives, so a
 * planting is remembered (by its op id) until the farm has numbered it; then the "in" is sent.
 * The note is kept on disk, so it outlives a lost connection and the app being closed.
 */

export interface Planted {
  /** Who planted it: only they say "in" for it. */
  readonly person: PersonId;
  readonly farm: FarmId;
  readonly opId: OpId;
  readonly at: number;
}

/** Where the plantings waiting for their "in" are kept. */
export interface PlantedStore {
  read(): Promise<readonly Planted[]>;
  write(planted: readonly Planted[]): Promise<void>;
}

/** A planting the farm hasn't numbered after this long is let go. */
const FORGET_AFTER_MS = 30 * 24 * 3_600_000;
/** How far back in the phone's copy of the log a planting is looked for. */
const LOOK_BACK = 500;

/** Plants a plan and notes that the planter is in, to be said once the farm numbers it. */
export async function plantAndJoin(
  client: DataClient,
  store: PlantedStore,
  farm: FarmId,
  me: PersonId,
  payload: SeedPlantedPayload,
  now = Date.now(),
): Promise<EnqueueResult> {
  const result = await client.send(farm, 'seed_planted', payload);
  if (result.status !== 'queued') return result;
  await store.write([...(await store.read()), { person: me, farm, opId: result.opId, at: now }]);
  await settlePlanted(client, store, me, now);
  return result;
}

type Outcome = 'done' | 'waiting';

async function settleOne(client: DataClient, p: Planted, me: PersonId): Promise<Outcome> {
  if (client.rejections().some((r) => r.opId === p.opId)) return 'done';
  const replica = await client.replica(p.farm);
  const { pending, confirmed } = replica.getState();
  if (pending.some((w) => w.opId === p.opId && !w.acked)) return 'waiting';
  const planted = (await client.events(p.farm, { limit: LOOK_BACK })).find(
    (e) => e.opId === p.opId,
  );
  const seed = planted && confirmed?.seeds.find((s) => s.seq === planted.seq);
  if (!seed) return 'waiting';
  const answering = pending.some(
    (w) => w.kind === 'rsvp' && (w.payload as { seed?: unknown } | null)?.seed === seed.seq,
  );
  if (seed.unsent || answering || seed.rsvps.some((r) => r.person === me)) return 'done';
  // Once queued, the outbox keeps the answer until the farm takes it.
  const sent = await client.send(p.farm, 'rsvp', { seed: seed.seq, answer: 'in' });
  return sent.status === 'queued' || sent.status === 'refused' ? 'done' : 'waiting';
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Sends the planter's "in" for every planting the farm has numbered, and forgets those done,
 * refused or too old. Answers how many are still waiting.
 */
export function settlePlanted(
  client: DataClient,
  store: PlantedStore,
  me: PersonId,
  now = Date.now(),
): Promise<number> {
  // One pass at a time, so an answer is never sent twice.
  const run = queue.then(() => settleAll(client, store, me, now));
  queue = run.catch(() => undefined);
  return run;
}

async function settleAll(
  client: DataClient,
  store: PlantedStore,
  me: PersonId,
  now: number,
): Promise<number> {
  const seen = await store.read();
  const waiting = new Set<OpId>();
  for (const p of seen) {
    if (now - p.at > FORGET_AFTER_MS) continue;
    if (p.person !== me) {
      waiting.add(p.opId);
      continue;
    }
    if ((await settleOne(client, p, me)) === 'waiting') waiting.add(p.opId);
  }
  // Plantings noted while this ran are kept as they are.
  const looked = new Set(seen.map((p) => p.opId));
  const kept = (await store.read()).filter((p) => !looked.has(p.opId) || waiting.has(p.opId));
  await store.write(kept);
  return kept.length;
}

/** A store in memory, for tests and for a phone without a disk to keep it on. */
export function memoryPlantedStore(): PlantedStore {
  let list: readonly Planted[] = [];
  return {
    read: () => Promise.resolve(list),
    write: (next) => {
      list = next;
      return Promise.resolve();
    },
  };
}
