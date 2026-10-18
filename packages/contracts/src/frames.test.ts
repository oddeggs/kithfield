import { describe, expect, it } from 'vitest';
import { type z } from 'zod';

import {
  CottageClientFrame,
  CottageNotice,
  CottageServerFrame,
  FarmClientFrame,
  FarmServerFrame,
} from './frames';
import { LIMITS, PROTOCOL_VERSION } from './primitives';
import { at, bea, eventPayloads, farm, farmState, opId, pip } from './samples.test-data';

const token = 'rt_0123456789abcdef0123';
const event = {
  seq: 41,
  opId,
  at,
  actor: bea,
  rulesVersion: 1,
  kind: 'message',
  payload: eventPayloads.message,
};
const chat = {
  farm,
  seq: 41,
  kind: 'message',
  actor: bea,
  at,
  preview: 'Bea: me!! bringing the good blanket',
  farmKind: 'farm',
  name: 'The Thursday Lot',
  waiting: 2,
  muted: false,
  pinned: true,
};

const farmClientFrames = [
  { type: 'hello', protocol: PROTOCOL_VERSION, token, lastSeq: 0, rulesVersion: 1 },
  { type: 'cmd', opId, kind: 'dewdrop', payload: { target: 41 } },
  { type: 'cmd', opId, kind: 'message', payload: { text: 'me too' } },
  { type: 'presence', here: true },
  { type: 'typing', on: true },
];

const farmServerFrames = [
  { type: 'snapshot', seq: 412, state: farmState },
  { type: 'events', events: [event, { ...event, seq: 42 }], more: false },
  { type: 'events', events: [], more: false },
  { type: 'event', event },
  { type: 'ack', opId, seq: 43 },
  { type: 'rejected', opId, reason: 'edit_window_closed' },
  { type: 'presence', here: [bea, pip] },
  { type: 'typing', people: [pip] },
  { type: 'error', code: 'unauthorized' },
];

const cottageClientFrames = [{ type: 'hello', protocol: PROTOCOL_VERSION, token }];
const cottageServerFrames = [
  { type: 'chats', chats: [chat] },
  { type: 'chat', chat: { ...chat, preview: null } },
  { type: 'error', code: 'banned' },
];

const roundTrip = (schema: z.ZodType, value: unknown) => {
  const parsed = schema.parse(value);
  expect(parsed).toEqual(value);
  expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
};

describe('socket frames', () => {
  it.each([
    ['farm, from the phone', FarmClientFrame, farmClientFrames],
    ['farm, to the phone', FarmServerFrame, farmServerFrames],
    ['cottage, from the phone', CottageClientFrame, cottageClientFrames],
    ['cottage, to the phone', CottageServerFrame, cottageServerFrames],
  ] as const)('%s: every frame round-trips unchanged', (_, schema, frames) => {
    for (const frame of frames) roundTrip(schema, frame);
  });

  it('round-trips the farm-to-cottage notice', () => {
    roundTrip(CottageNotice, { farm, seq: 41, kind: 'message', actor: bea, at, preview: null });
  });

  it('rejects malformed frames from the phone', () => {
    const hello = farmClientFrames[0];
    const bad = [
      { ...hello, protocol: PROTOCOL_VERSION + 1 },
      { ...hello, token: 'short' },
      { ...hello, lastSeq: -1 },
      { ...hello, rulesVersion: 0 },
      { type: 'cmd', opId, kind: 'weather', payload: eventPayloads.weather },
      { type: 'cmd', opId, kind: 'message', payload: { text: '' } },
      { type: 'cmd', kind: 'wave', payload: {} },
      { type: 'presence' },
      { type: 'typing', on: 'yes' },
      { type: 'read', seq: 3 },
    ];
    for (const frame of bad) expect(FarmClientFrame.safeParse(frame).success).toBe(false);
  });

  it('rejects malformed frames from the farm', () => {
    const tooMany = Array.from({ length: LIMITS.eventsBatch + 1 }, (_, i) => ({
      ...event,
      seq: i + 1,
    }));
    const bad = [
      { type: 'events', events: tooMany, more: true },
      { type: 'events', events: [event] },
      { type: 'snapshot', seq: 412 },
      { type: 'ack', opId },
      { type: 'rejected', opId, reason: 'because' },
      { type: 'presence', here: Array.from({ length: LIMITS.members + 1 }, (_, i) => `p_${i}`) },
      { type: 'error', code: 'teapot' },
    ];
    for (const frame of bad) expect(FarmServerFrame.safeParse(frame).success).toBe(false);
    expect(
      CottageServerFrame.safeParse({ type: 'chat', chat: { ...chat, waiting: -1 } }).success,
    ).toBe(false);
  });
});
