import { describe, expect, it } from 'vitest';

import { COMMAND_KINDS } from './commands';
import { EVENT_KINDS, FARM_WRITTEN_KINDS } from './events';
import { type z } from 'zod';

import {
  COTTAGE_CLIENT_FRAME_TYPES,
  COTTAGE_SERVER_FRAME_TYPES,
  CottageClientFrame,
  CottageServerFrame,
  FARM_CLIENT_FRAME_TYPES,
  FARM_SERVER_FRAME_TYPES,
  FarmClientFrame,
  FarmServerFrame,
} from './frames';

/** The event kinds listed in the farm model's event log table, group by group. */
const DOC_EVENT_KINDS = {
  chat: ['message', 'edit', 'unsend', 'reaction', 'sticker', 'media', 'voice', 'link'],
  gestures: ['dewdrop', 'firefly', 'wave', 'knock', 'hug', 'quiet_note', 'slow_post'],
  plans: ['seed_planted', 'vote', 'rsvp', 'checkin'],
  keepsakes: ['gift', 'scrapbook_page'],
  presence: ['farm_opened', 'hibernate'],
  membership: ['joined', 'left', 'removed', 'critter_changed', 'settings_changed'],
  writtenByTheFarm: ['weather', 'shared_rain', 'season_rolled', 'harvested', 'rules_changed'],
};

/**
 * Kinds the docs need but don't list: pins, statuses, plan changes, the fire room, trades, the
 * farm's identity, restoring after an appeal, visitors at the gate and birthday cards.
 */
const ADDED_KINDS = [
  'pin',
  'status',
  'seed_changed',
  'fire',
  'traded',
  'farm_created',
  'restored',
  'gate',
  'card_signed',
];

/** Written by the farm with no person behind them. */
const FARM_ONLY_KINDS = [
  ...['weather', 'shared_rain', 'season_rolled', 'harvested'],
  'rules_changed',
];

/** Every kind of care the families table counts. */
const DOC_TENDING_KINDS = [
  'dewdrop',
  'message',
  'link',
  'quiet_note',
  'slow_post',
  'media',
  'sticker',
  'voice',
  'firefly',
  'wave',
  'knock',
  'hug',
  'gift',
  'seed_planted',
  'vote',
  'rsvp',
  'scrapbook_page',
  'checkin',
];

/** The farm protocol table: frames by direction ("both" appears in each). */
const DOC_FARM_FRAMES = {
  fromPhone: ['hello', 'cmd', 'presence', 'typing'],
  fromFarm: ['snapshot', 'events', 'ack', 'rejected', 'event', 'presence', 'typing'],
};

/** A type has a schema when a bare frame of it is not waved through as `unknown`. */
const hasSchema = (schema: z.ZodType<{ type: string }>, type: string) => {
  const parsed = schema.safeParse({ type });
  return !parsed.success || parsed.data.type !== 'unknown';
};

describe('coverage of the docs', () => {
  it('has a schema for every event kind in the farm model', () => {
    for (const kind of Object.values(DOC_EVENT_KINDS).flat()) {
      expect(EVENT_KINDS, kind).toContain(kind);
    }
  });

  it('adds only the listed kinds beyond the docs', () => {
    const documented = new Set<string>(Object.values(DOC_EVENT_KINDS).flat());
    const extra = EVENT_KINDS.filter((k) => !documented.has(k));
    expect(extra.sort()).toEqual([...ADDED_KINDS].sort());
  });

  it('lets a phone write every kind of care', () => {
    for (const kind of DOC_TENDING_KINDS) expect(COMMAND_KINDS, kind).toContain(kind);
  });

  it('keeps the farm-written kinds out of commands', () => {
    for (const kind of [...FARM_ONLY_KINDS, 'farm_created', 'restored', 'joined', 'hibernate']) {
      expect(FARM_WRITTEN_KINDS, kind).toContain(kind);
      expect(COMMAND_KINDS).not.toContain(kind);
    }
  });

  it('has a schema for every frame in the farm protocol', () => {
    for (const type of DOC_FARM_FRAMES.fromPhone) {
      expect(hasSchema(FarmClientFrame, type), type).toBe(true);
    }
    for (const type of DOC_FARM_FRAMES.fromFarm) {
      expect(hasSchema(FarmServerFrame, type), type).toBe(true);
    }
    expect([...FARM_CLIENT_FRAME_TYPES].sort()).toEqual([...DOC_FARM_FRAMES.fromPhone].sort());
    const extra = FARM_SERVER_FRAME_TYPES.filter((t) => !DOC_FARM_FRAMES.fromFarm.includes(t));
    expect(extra).toEqual(['error']);
  });

  it('lists exactly the frame types each socket knows', () => {
    const sockets = [
      [FarmClientFrame, FARM_CLIENT_FRAME_TYPES],
      [FarmServerFrame, FARM_SERVER_FRAME_TYPES],
      [CottageClientFrame, COTTAGE_CLIENT_FRAME_TYPES],
      [CottageServerFrame, COTTAGE_SERVER_FRAME_TYPES],
    ] as const;
    for (const [schema, types] of sockets) {
      for (const type of types) expect(hasSchema(schema, type), type).toBe(true);
      expect(hasSchema(schema, 'not_a_frame')).toBe(false);
    }
    expect([...COTTAGE_SERVER_FRAME_TYPES].sort()).toEqual([
      'chat',
      'chats',
      'error',
      'safety_note',
    ]);
  });
});
