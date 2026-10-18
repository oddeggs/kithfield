import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { FarmEvent, type EventEnvelope } from '@kithfield/contracts';

import { runMigrations } from '../db/migrate';
import { MIGRATIONS } from '../db/migrations';
import { FarmReplica, type SyncReport } from './farm-replica';
import type { FarmRules } from './farm-rules';
import { createSyncStore, type StoredRejection } from './sync-store';
import { testFarmRules, type TestFarmView } from './test/test-farm-rules';
import { openFileDb, type FileDb } from './test/test-phone';

const FARM = 'f_lot';
const BEA = 'p_bea';
const critter = {
  species: 'rabbit',
  coat: 'cocoa',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
};

let n = 0;
const event = (
  seq: number,
  actor: string | null,
  kind: string,
  payload: unknown,
): EventEnvelope => {
  n += 1;
  return FarmEvent.parse({
    seq,
    opId: `01900000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`,
    at: 1_792_000_000_000 + seq,
    rulesVersion: 1,
    actor,
    kind,
    payload,
  });
};

const opening = [
  event(1, null, 'farm_created', {
    farm: FARM,
    kind: 'farm',
    name: 'The Lot',
    land: 'meadow',
    timeZone: 'Europe/London',
    hemisphere: 'north',
  }),
  event(2, BEA, 'joined', { name: 'bea', critter, via: 'created' }),
];

let db: FileDb;
let reports: SyncReport[];
let rejections: StoredRejection[];

async function replica(rules: FarmRules<TestFarmView> = testFarmRules) {
  return FarmReplica.open({
    farm: FARM,
    store: createSyncStore(db),
    rules,
    newOpId: () => '01900000-0000-7000-8000-ffffffffffff',
    now: () => 1_792_000_100_000,
    report: (r) => reports.push(r),
    onRejected: (r) => rejections.push(r),
  });
}

beforeEach(async () => {
  db = openFileDb(':memory:');
  await runMigrations(db, MIGRATIONS);
  reports = [];
  rejections = [];
});

afterEach(() => db.close());

describe('applying events', () => {
  it('builds the farm from seq 1 when it holds nothing, and skips what it already holds', async () => {
    const r = await replica();
    expect(await r.handle({ type: 'events', events: opening, more: false })).toEqual({
      caughtUp: true,
    });
    await r.handle({ type: 'event', event: opening[1]! });
    expect(r.getState().lastSeq).toBe(2);
    expect(r.getState().confirmed?.members.map((m) => m.person)).toEqual([BEA]);
  });

  it('stops at a gap and asks to say hello again from where it is', async () => {
    const r = await replica();
    await r.handle({ type: 'events', events: opening, more: false });
    const outcome = await r.handle({ type: 'event', event: event(4, BEA, 'wave', {}) });
    expect(outcome).toEqual({ resync: 'from_last' });
    expect(r.getState().lastSeq).toBe(2);
    expect(r.helloSeq()).toBe(2);
  });

  it('stops before an event under newer farm rules', async () => {
    const r = await replica();
    await r.handle({ type: 'events', events: opening, more: false });
    const newer = { ...event(3, BEA, 'wave', {}), rulesVersion: 2 };
    expect(await r.handle({ type: 'event', event: newer })).toEqual({ rulesOutdated: true });
    expect(r.getState().lastSeq).toBe(2);
  });

  it('reports a reducer failure and asks for the snapshot', async () => {
    const failing: FarmRules<TestFarmView> = {
      ...testFarmRules,
      applyEvent: (state, e) => {
        if (e.kind === 'wave') throw new Error('boom');
        return testFarmRules.applyEvent(state, e);
      },
    };
    const r = await replica(failing);
    await r.handle({ type: 'events', events: opening, more: false });
    expect(await r.handle({ type: 'event', event: event(3, BEA, 'wave', {}) })).toEqual({
      resync: 'snapshot',
    });
    expect(reports).toEqual([{ type: 'reducer_failed', farm: FARM, seq: 3, kind: 'wave' }]);
    expect(r.helloSeq()).toBe(0);
  });

  it('tombstones everything a deleted account wrote, keeping the facts', async () => {
    const r = await replica();
    await r.handle({
      type: 'events',
      events: [
        ...opening,
        event(3, BEA, 'message', { text: 'hello all' }),
        event(4, BEA, 'pin', { target: 3, on: true }),
        event(5, BEA, 'left', { how: 'account_deleted' }),
      ],
      more: false,
    });
    const store = createSyncStore(db);
    expect((await store.event(FARM, 3))?.payload).toEqual({ tombstone: 'author_deleted' });
    expect((await store.event(FARM, 4))?.payload).toEqual({
      tombstone: 'author_deleted',
      facts: { target: 3, on: true },
    });
    expect((await store.event(FARM, 5))?.payload).toEqual({ how: 'account_deleted' });
  });

  it('asks for events an appeal restored', async () => {
    const r = await replica();
    await r.handle({ type: 'events', events: opening, more: false });
    expect(
      await r.handle({ type: 'event', event: event(3, null, 'restored', { target: 2 }) }),
    ).toEqual({
      restored: [2],
    });
  });
});

describe('the outbox', () => {
  it('refuses a write no farm would take without queueing it', async () => {
    const r = await replica();
    expect(await r.enqueue(BEA, { kind: 'joined', payload: {} })).toEqual({
      status: 'refused',
      reason: 'invalid',
    });
    expect(await r.enqueue(BEA, { kind: 'message', payload: { text: '' } })).toEqual({
      status: 'refused',
      reason: 'invalid',
    });
    expect(r.getState().pending).toEqual([]);
  });

  it('ignores answers for writes it doesn’t hold', async () => {
    const r = await replica();
    await r.handle({ type: 'ack', opId: '01900000-0000-7000-8000-000000000999', seq: 9 });
    await r.handle({
      type: 'rejected',
      opId: '01900000-0000-7000-8000-000000000999',
      reason: 'gone',
    });
    expect(rejections).toEqual([]);
    expect(r.getState().pending).toEqual([]);
  });

  it('keeps an acknowledged write drawn until its event arrives', async () => {
    const r = await replica();
    await r.handle({ type: 'events', events: opening, more: false });
    const sent = await r.enqueue(BEA, { kind: 'wave', payload: {} });
    if (sent.status !== 'queued') throw new Error('expected queued');
    await r.handle({ type: 'ack', opId: sent.opId, seq: 3 });
    expect(r.getState().pending).toEqual([
      expect.objectContaining({ opId: sent.opId, acked: true }),
    ]);
    expect(r.getState().state?.familyTendedAt.gestures).not.toBeNull();
    expect(r.unsent()).toEqual([]);

    await r.handle({ type: 'event', event: { ...event(3, BEA, 'wave', {}), opId: sent.opId } });
    expect(r.getState().pending).toEqual([]);
    expect(r.getState().state).toEqual(r.getState().confirmed);
  });
});
