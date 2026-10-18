import { describe, expect, it } from 'vitest';

import {
  COMMAND_KINDS,
  CommandResult,
  FarmCommand,
  RejectReason,
  type CommandKind,
} from './commands';
import { EVENT_KINDS, FARM_WRITTEN_KINDS } from './events';
import { badEventPayloads, bea, eventPayloads, fig, opId } from './samples.test-data';

/** Where a command's payload differs from the event the farm stores. */
const overrides: Partial<Record<CommandKind, object>> = {
  unsend: { target: 14 },
  slow_post: { to: bea, text: 'a long letter', when: 'weekend' },
  left: {},
  removed: { person: fig, removeMedia: true },
  fire: { state: 'sat' },
};

const payloadFor = (kind: CommandKind) => overrides[kind] ?? eventPayloads[kind];

const roundTrip = (value: unknown) => {
  const parsed = FarmCommand.parse(value);
  expect(parsed).toEqual(value);
  expect(FarmCommand.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
};

describe('farm commands', () => {
  it.each(COMMAND_KINDS)('%s: a valid command parses and survives JSON unchanged', (kind) => {
    roundTrip({ opId, kind, payload: payloadFor(kind) });
  });

  it.each(COMMAND_KINDS.filter((k) => !(k in overrides)))('%s: invalid payloads fail', (kind) => {
    for (const payload of badEventPayloads[kind]) {
      expect(FarmCommand.safeParse({ opId, kind, payload }).success).toBe(false);
    }
  });

  it('covers every event kind a person writes, and none the farm writes', () => {
    const farmWritten = new Set<string>(FARM_WRITTEN_KINDS);
    const personKinds = EVENT_KINDS.filter((k) => !farmWritten.has(k));
    expect([...COMMAND_KINDS].sort()).toEqual([...personKinds].sort());
    for (const kind of FARM_WRITTEN_KINDS) {
      expect(FarmCommand.safeParse({ opId, kind, payload: {} }).success).toBe(false);
    }
  });

  it('leaves the server-set fields to the farm', () => {
    const cases = [
      { kind: 'unsend', payload: { target: 14, by: 'safety' } },
      { kind: 'slow_post', payload: { to: bea, text: 'hi', deliverAt: 1 } },
      { kind: 'left', payload: { how: 'account_deleted' } },
      { kind: 'fire', payload: { state: 'out' } },
    ];
    for (const c of cases) {
      const parsed = FarmCommand.safeParse({ opId, ...c });
      const kept =
        parsed.success && JSON.stringify(parsed.data.payload) === JSON.stringify(c.payload);
      expect(kept, c.kind).toBe(false);
    }
  });

  it('keeps the safety team settings out of commands', () => {
    for (const payload of [
      { setting: 'frozen', on: true },
      { setting: 'paused', person: fig, until: null },
    ]) {
      expect(FarmCommand.safeParse({ opId, kind: 'settings_changed', payload }).success).toBe(
        false,
      );
    }
    const calendar = { setting: 'calendar', timeZone: 'Asia/Ho_Chi_Minh', hemisphere: 'north' };
    roundTrip({ opId, kind: 'settings_changed', payload: calendar });
  });

  it('hibernates over HTTP, not as a farm command', () => {
    expect(FarmCommand.safeParse({ opId, kind: 'hibernate', payload: { on: true } }).success).toBe(
      false,
    );
  });

  it('needs a lowercase UUIDv7 op id', () => {
    const payload = eventPayloads.wave;
    for (const bad of [
      undefined,
      '',
      opId.toUpperCase(),
      '0192f1e2-3b4c-4d5e-8f60-123456789abc',
      'not-a-uuid',
    ]) {
      expect(FarmCommand.safeParse({ opId: bad, kind: 'wave', payload }).success).toBe(false);
    }
  });
});

describe('command results', () => {
  it('round-trips an ack and every rejection reason', () => {
    const samples = [
      { result: 'ack', opId, seq: 41 },
      ...RejectReason.options.map((reason) => ({ result: 'rejected', opId, reason })),
    ];
    for (const sample of samples) {
      const parsed = CommandResult.parse(sample);
      expect(parsed).toEqual(sample);
      expect(CommandResult.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    }
  });

  it('rejects malformed results', () => {
    for (const bad of [
      { result: 'ack', opId },
      { result: 'ack', opId, seq: 0 },
      { result: 'rejected', opId, reason: 'nope' },
      { result: 'dropped', opId },
    ]) {
      expect(CommandResult.safeParse(bad).success).toBe(false);
    }
  });
});
