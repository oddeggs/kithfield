import type { CottageDelivery, PersonId } from '@kithfield/contracts';

import type { Bindings } from '../../env';
import type { CottageNotifier } from '../ports';

/** The cottage's side of the handoff: one call per member per committed event. */
type CottageInbox = { deliver(delivery: CottageDelivery): Promise<void> };

/** Calls the member's `CottageDO` (one per person, addressed by person id). */
export const cottageNotifier: CottageNotifier = {
  async deliver(env: Bindings, person: PersonId, delivery: CottageDelivery): Promise<void> {
    const stub = env.COTTAGE.get(env.COTTAGE.idFromName(person));
    await (stub as unknown as CottageInbox).deliver(delivery);
  },
};
