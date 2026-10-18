import { describe, expect, it } from 'vitest';

import { COMMAND_KINDS } from './commands';
import { EVENT_KINDS, FARM_WRITTEN_KINDS } from './events';
import { CottageClientFrame, CottageServerFrame, FarmClientFrame, FarmServerFrame } from './frames';

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

/** Kinds the docs need but don't list: pins, statuses, plan changes, the fire room, trades. */
const ADDED_KINDS = ['pin', 'status', 'seed_changed', 'fire', 'traded'];

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

const frameTypes = (schema: { _zod: { propValues?: Record<string, Set<unknown>> } }) => [
  ...(schema._zod.propValues?.['type'] ?? []),
];

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
    for (const kind of DOC_EVENT_KINDS.writtenByTheFarm) {
      expect(FARM_WRITTEN_KINDS, kind).toContain(kind);
      expect(COMMAND_KINDS).not.toContain(kind);
    }
  });

  it('has a schema for every frame in the farm protocol', () => {
    expect(frameTypes(FarmClientFrame).sort()).toEqual([...DOC_FARM_FRAMES.fromPhone].sort());
    const fromFarm = frameTypes(FarmServerFrame);
    for (const type of DOC_FARM_FRAMES.fromFarm) expect(fromFarm, type).toContain(type);
    expect(fromFarm.filter((t) => !DOC_FARM_FRAMES.fromFarm.includes(t as string))).toEqual([
      'error',
    ]);
  });

  it('has a hello and a chat list on the cottage socket', () => {
    expect(frameTypes(CottageClientFrame)).toEqual(['hello']);
    expect(frameTypes(CottageServerFrame).sort()).toEqual(['chat', 'chats', 'error']);
  });
});
