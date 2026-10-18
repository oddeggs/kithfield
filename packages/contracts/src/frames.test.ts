import { describe, expect, it } from 'vitest';
import { type z } from 'zod';

import { parseEvent } from './events';
import {
  CottageClientFrame,
  CottageNotice,
  CottageServerFrame,
  FarmClientFrame,
  FarmServerFrame,
  PING,
  PONG,
} from './frames';
import { LIMITS, PROTOCOL_VERSION } from './primitives';
import { at, bea, eventPayloads, farm, opId, pip } from './samples.test-data';
import { farmState } from './state-samples.test-data';

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
const laterEvent = { ...event, seq: 42, kind: 'lantern_lit', payload: { colour: 'amber' } };
const notice = {
  farm,
  seq: 41,
  kind: 'message',
  actor: bea,
  at,
  preview: 'Bea: me!! bringing the good blanket',
  forYou: false,
};
const chat = {
  ...notice,
  farmKind: 'farm',
  name: 'The Thursday Lot',
  waiting: 2,
  muted: false,
  pinned: true,
};

const farmClientFrames = [
  { type: 'hello', protocol: PROTOCOL_VERSION, token, lastSeq: 0, rulesVersion: 1 },
  { type: 'hello', protocol: PROTOCOL_VERSION + 1, token, lastSeq: 412, rulesVersion: 3 },
  { type: 'cmd', opId, kind: 'dewdrop', payload: { target: 41 } },
  { type: 'cmd', opId, kind: 'message', payload: { text: 'me too' } },
  { type: 'presence', here: true },
  { type: 'typing', on: true },
];

const farmServerFrames = [
  { type: 'snapshot', seq: 412, state: farmState },
  { type: 'events', events: [event, laterEvent], more: false },
  { type: 'events', events: [], more: false },
  { type: 'event', event },
  { type: 'event', event: laterEvent },
  { type: 'ack', opId, seq: 43 },
  { type: 'rejected', opId, reason: 'edit_window_closed' },
  { type: 'presence', here: [bea, pip] },
  { type: 'typing', people: [pip] },
  { type: 'error', code: 'rules_outdated' },
];

const cottageClientFrames = [{ type: 'hello', protocol: PROTOCOL_VERSION, token }];
const cottageServerFrames = [
  { type: 'chats', chats: [chat, { ...chat, farmKind: 'visit', name: null, forYou: true }] },
  { type: 'chat', chat: { ...chat, preview: null } },
  { type: 'safety_note' },
  { type: 'error', code: 'banned' },
];

const roundTrip = (schema: z.ZodType, value: unknown) => {
  const parsed = schema.parse(value);
  expect(parsed).toEqual(value);
  expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
};

const sockets = [
  ['farm, from the phone', FarmClientFrame, farmClientFrames],
  ['farm, to the phone', FarmServerFrame, farmServerFrames],
  ['cottage, from the phone', CottageClientFrame, cottageClientFrames],
  ['cottage, to the phone', CottageServerFrame, cottageServerFrames],
] as const;

describe('socket frames', () => {
  it.each(sockets)('%s: every frame round-trips unchanged', (_, schema, frames) => {
    for (const frame of frames) roundTrip(schema, frame);
  });

  it('round-trips the farm-to-cottage notice', () => {
    roundTrip(CottageNotice, { ...notice, preview: null, forYou: true });
    expect(CottageNotice.safeParse({ ...notice, forYou: undefined }).success).toBe(false);
  });

  it('keeps a batch whole when it holds a kind this app does not know', () => {
    const frame = FarmServerFrame.parse(farmServerFrames[1]);
    if (frame.type !== 'events') throw new Error('expected an events frame');
    expect(frame.events.map((e) => parseEvent(e).known)).toEqual([true, false]);
  });

  it.each(sockets)('%s: an unknown frame type parses as `unknown`', (_, schema) => {
    expect(schema.parse({ type: 'lanterns', lit: 3 })).toEqual({
      type: 'unknown',
      received: 'lanterns',
    });
  });

  it('uses bare strings for the keep-alive', () => {
    expect([PING, PONG]).toEqual(['ping', 'pong']);
  });

  it('rejects malformed frames from the phone', () => {
    const hello = farmClientFrames[0];
    const bad = [
      { ...hello, protocol: 0 },
      { ...hello, protocol: 1.5 },
      { ...hello, token: 'short' },
      { ...hello, lastSeq: -1 },
      { ...hello, rulesVersion: 0 },
      { type: 'cmd', opId, kind: 'weather', payload: eventPayloads.weather },
      { type: 'cmd', opId, kind: 'message', payload: { text: '' } },
      { type: 'cmd', kind: 'wave', payload: {} },
      { type: 'presence' },
      { type: 'typing', on: 'yes' },
      { kind: 'no type' },
    ];
    for (const frame of bad) expect(FarmClientFrame.safeParse(frame).success).toBe(false);
  });

  it('rejects malformed frames from the farm and the cottage', () => {
    const tooMany = Array.from({ length: LIMITS.eventsBatch + 1 }, (_, i) => ({
      ...event,
      seq: i + 1,
    }));
    const bad = [
      { type: 'events', events: tooMany, more: true },
      { type: 'events', events: [event] },
      { type: 'events', events: [{ ...event, seq: 0 }], more: false },
      { type: 'event', event: { ...event, kind: 'Not A Kind' } },
      { type: 'snapshot', seq: 412 },
      { type: 'ack', opId },
      { type: 'rejected', opId, reason: 'rules_outdated' },
      { type: 'presence', here: Array.from({ length: LIMITS.members + 1 }, (_, i) => `p_${i}`) },
      { type: 'error', code: 'teapot' },
    ];
    for (const frame of bad) expect(FarmServerFrame.safeParse(frame).success).toBe(false);
    for (const frame of [
      { type: 'chat', chat: { ...chat, waiting: -1 } },
      { type: 'chat', chat: { ...chat, forYou: 'yes' } },
    ]) {
      expect(CottageServerFrame.safeParse(frame).success).toBe(false);
    }
  });
});
