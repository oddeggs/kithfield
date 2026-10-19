import { describe, expect, it } from '@jest/globals';

import { outgoingDrafts, OutgoingWrites, type OutgoingWrite } from './outgoing';
import { buildTimeline, type UnsentWrite } from './timeline';

const T0 = Date.UTC(2026, 9, 15, 18, 0);
const sticker: OutgoingWrite = {
  farm: 'f_lot',
  opId: '0192f1e2-3b4c-7d5e-8f60-000000000042',
  kind: 'sticker',
  payload: { pack: 'own', sticker: 'love-you' },
  createdAt: T0,
};
const base = { events: [], refused: [], me: 'me', state: null, now: T0 + 1000 };

describe('a sticker on its way from the picker', () => {
  it('is in the chat under its op id before its write is queued, and stays under it after', () => {
    const store = new OutgoingWrites();
    store.add(sticker);
    const before = buildTimeline({
      ...base,
      unsent: outgoingDrafts(store.list(), 'f_lot', new Set()),
    });
    expect(before).toContainEqual(
      expect.objectContaining({ type: 'bubble', key: sticker.opId, delivery: 'sending' }),
    );

    // The outbox has it now: the chat draws that write, under the same key, and only once.
    const queued: UnsentWrite = {
      opId: sticker.opId,
      kind: 'sticker',
      payload: sticker.payload,
      createdAt: T0 + 5,
      acked: false,
    };
    const after = buildTimeline({
      ...base,
      unsent: [queued, ...outgoingDrafts(store.list(), 'f_lot', new Set([sticker.opId]))],
    });
    const rows = after.filter((r) => r.key === sticker.opId);
    expect(rows).toHaveLength(1);
  });

  it('is only drawn in its own farm, and goes once it is let go of', () => {
    const store = new OutgoingWrites();
    let heard = 0;
    store.subscribe(() => (heard += 1));
    store.add(sticker);
    expect(outgoingDrafts(store.list(), 'f_other', new Set())).toEqual([]);
    store.drop(sticker.opId);
    expect(outgoingDrafts(store.list(), 'f_lot', new Set())).toEqual([]);
    expect(heard).toBe(2);
  });
});
