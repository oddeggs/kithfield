import type { DataClient } from '../../../data';
import { ApiError } from '../../../data';
import type { ShopApi } from '../api';
import { giftOpId, givenPayload, nextStep } from './pending-gifts';
import { dropPendingGift, readPendingGifts } from './pending-gifts-store';

/**
 * Picks up gifts paid for but not on the step yet (the app closed in between): ties a bought one
 * to its transaction, leaves a paid one on the step with its own op id (never twice), and forgets
 * what is given, opened, unknown, or a day old and never paid.
 */
export async function resumePendingGifts(
  person: string,
  api: ShopApi,
  client: Pick<DataClient, 'send'>,
  now: number = Date.now(),
): Promise<void> {
  for (const pending of await readPendingGifts(person)) {
    try {
      let state = await api.gift(pending.gift).then(
        (view) => view.state,
        (error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return 'missing' as const;
          throw error;
        },
      );
      let step = nextStep(pending, state, now);
      if (step === 'pay' && pending.transaction !== null) {
        state = (await api.giftPaid(pending.gift, pending.transaction)).state;
        step = nextStep(pending, state, now);
      }
      if (step === 'give') {
        await client.send(
          pending.farm,
          'gift',
          givenPayload(pending),
          giftOpId(pending.gift, pending.at),
        );
      } else if (step === 'drop') {
        await dropPendingGift(person, pending.gift);
      }
    } catch {
      // Offline or the server didn't answer: tried again the next time the shop opens.
    }
  }
}
