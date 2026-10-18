import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { FarmEvent, type EventEnvelope } from '@kithfield/contracts';

import { runMigrations } from '../db/migrate';
import { MIGRATIONS } from '../db/migrations';
import { FarmReplica } from './farm-replica';
import { kithfieldRules } from './farm-rules';
import { createSyncStore } from './sync-store';
import { openFileDb, type FileDb } from './test/test-phone';

const FARM = 'f_lot';
const BEA = 'p_bea';
const PIP = 'p_pip';
const MIN = 60_000;
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

/** 2026-10-18 in London (BST, UTC+1). */
const MORNING = Date.UTC(2026, 9, 18, 8, 0);

let n = 0;
const event = (
  seq: number,
  actor: string | null,
  kind: string,
  payload: unknown,
  at: number,
  day = '2026-10-18',
): EventEnvelope => {
  n += 1;
  return FarmEvent.parse({
    seq,
    opId: `01900000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`,
    at,
    day,
    rulesVersion: 2,
    actor,
    kind,
    payload,
  });
};

const opening = [
  event(
    1,
    null,
    'farm_created',
    {
      farm: FARM,
      kind: 'farm',
      name: 'The Lot',
      land: 'meadow',
      timeZone: 'Europe/London',
      hemisphere: 'north',
    },
    MORNING,
  ),
  event(2, BEA, 'joined', { name: 'bea', critter, via: 'created' }, MORNING),
  event(3, PIP, 'joined', { name: 'pip', critter, via: 'invite' }, MORNING),
];

let db: FileDb;
let now = MORNING;
let ops = 0;

const open = () =>
  FarmReplica.open({
    farm: FARM,
    store: createSyncStore(db),
    rules: kithfieldRules,
    newOpId: () => {
      ops += 1;
      return `01900000-0000-7000-8000-${(0xf00000 + ops).toString(16).padStart(12, '0')}`;
    },
    now: () => now,
    report: () => undefined,
    onRejected: () => undefined,
  });

beforeEach(async () => {
  db = openFileDb(':memory:');
  await runMigrations(db, MIGRATIONS);
  now = MORNING;
});

afterEach(() => db.close());

describe('a dry run of a write', () => {
  it('answers exactly what queuing the write would', async () => {
    const r = await open();
    await r.handle({
      type: 'events',
      events: [
        ...opening,
        event(4, BEA, 'message', { text: 'picnic?' }, MORNING),
        event(5, PIP, 'message', { text: 'yes' }, MORNING),
        event(
          6,
          BEA,
          'slow_post',
          { to: PIP, text: 'hi', when: 'morning', deliverAt: MORNING + 5 * MIN },
          MORNING,
        ),
      ],
      more: false,
    });
    now = MORNING + 20 * MIN;
    const writes = [
      { kind: 'message', payload: { text: 'hello' } },
      { kind: 'edit', payload: { target: 4, text: 'too late' } },
      { kind: 'edit', payload: { target: 5, text: 'not mine' } },
      { kind: 'unsend', payload: { target: 6 } },
      { kind: 'unsend', payload: { target: 4 } },
      { kind: 'dewdrop', payload: { target: 99 } },
      { kind: 'knock', payload: { to: PIP } },
      { kind: 'knock', payload: { to: PIP } },
      { kind: 'reaction', payload: { target: 5, reaction: 'dewdrop' } },
    ];
    const dry = [];
    const real = [];
    for (const w of writes) {
      const check = r.canWrite(BEA, w);
      dry.push(check.ok ? 'queued' : check.reason);
      const result = await r.enqueue(BEA, w);
      real.push(result.status === 'queued' ? 'queued' : result.reason);
    }
    expect(dry).toEqual(real);
    expect(real).toEqual([
      'queued',
      'edit_window_closed',
      'not_allowed',
      'not_allowed',
      'queued',
      'not_found',
      'queued',
      'limit_reached',
      'invalid',
    ]);
  });

  it('allows one knock per friend per farm day, either side of midnight on the farm', async () => {
    const r = await open();
    const lateEvening = Date.UTC(2026, 9, 18, 22, 59); // 23:59 in London
    await r.handle({
      type: 'events',
      events: [...opening, event(4, BEA, 'knock', { to: PIP }, lateEvening - 30 * MIN)],
      more: false,
    });
    const knock = { kind: 'knock', payload: { to: PIP } };
    now = lateEvening;
    expect(r.canWrite(BEA, knock)).toEqual({ ok: false, reason: 'limit_reached' });
    now = Date.UTC(2026, 9, 18, 23, 1); // 00:01 the next day in London
    expect(r.canWrite(BEA, knock)).toEqual({ ok: true });
  });
});
