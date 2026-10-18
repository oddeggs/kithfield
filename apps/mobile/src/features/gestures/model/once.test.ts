import { describe, expect, it } from '@jest/globals';

import { umbrellaBrought } from './care';
import { createInFlight, inFlightKey } from './in-flight';
import { reactionWrite, type PendingCare } from './message';

/**
 * A phone with no signal: every write stays in the outbox (pending) and never reaches the log.
 * Queuing takes a moment, as the outbox's SQLite write does.
 */
function offlinePhone() {
  const pending: PendingCare[] = [];
  const queue = async (kind: string, payload: unknown) => {
    await new Promise((r) => setTimeout(r, 5));
    pending.push({ kind, payload });
    return true;
  };
  return { pending, queue };
}

describe('care is written once', () => {
  it('sends one dewdrop for a double tap, and none more when the menu opens again offline', async () => {
    const phone = offlinePhone();
    const tap = (guard: ReturnType<typeof createInFlight>) => {
      const write = reactionWrite({
        id: 'dewdrop',
        target: 7,
        events: [],
        pending: phone.pending,
        me: 'me',
      });
      if (!write) return Promise.resolve(false);
      return guard.once(inFlightKey('f', write.kind, write.payload), () =>
        phone.queue(write.kind, write.payload),
      );
    };
    const menu = createInFlight();
    await Promise.all([tap(menu), tap(menu)]);
    // The menu is closed and opened again; the dewdrop is still waiting in the outbox.
    await tap(createInFlight());
    expect(phone.pending).toEqual([{ kind: 'dewdrop', payload: { target: 7 } }]);
  });

  it('brings one umbrella however many times it is tapped offline', async () => {
    const phone = offlinePhone();
    const guard = createInFlight();
    const tap = () => {
      const brought = umbrellaBrought({
        events: [],
        pending: phone.pending,
        to: 'fig',
        since: 0,
        me: 'me',
      });
      if (brought) return Promise.resolve(false);
      const payload = { to: 'fig', umbrella: true };
      return guard.once(inFlightKey('f', 'hug', payload), () => phone.queue('hug', payload));
    };
    await Promise.all([tap(), tap()]);
    await tap();
    await tap();
    expect(phone.pending).toEqual([{ kind: 'hug', payload: { to: 'fig', umbrella: true } }]);
  });

  it('still takes a reaction back with a second tap once the first is queued', async () => {
    const phone = offlinePhone();
    const first = reactionWrite({ id: 'sun', target: 7, events: [], pending: [], me: 'me' });
    if (first) await phone.queue(first.kind, first.payload);
    expect(
      reactionWrite({ id: 'sun', target: 7, events: [], pending: phone.pending, me: 'me' }),
    ).toEqual({ kind: 'reaction', payload: { target: 7, reaction: null } });
  });
});
