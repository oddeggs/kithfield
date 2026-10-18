import type { CottageDelivery, CottageFarm, PersonId, TimeZone } from '@kithfield/contracts';

import { cottageOf } from '../../cottage/stub';
import type { Bindings } from '../../env';

/** The farm object's calls to each member's cottage (one `CottageDO` per person). */
export const cottage = {
  /** A committed event, for the chat list and push. */
  deliver: (env: Bindings, person: PersonId, delivery: CottageDelivery) =>
    cottageOf(env, person).deliver(delivery),
  /** The farm's row: on joining, a rename, or a visit peer's change. */
  upsertFarm: (env: Bindings, person: PersonId, farm: CottageFarm) =>
    cottageOf(env, person).upsertFarm(farm),
  /** The person left or was removed. */
  leaveFarm: (env: Bindings, person: PersonId, farm: string) =>
    cottageOf(env, person).leaveFarm(farm),
  /** Whether the person hibernates, and their own time zone (slow posts arrive in it). */
  async settingsOf(
    env: Bindings,
    person: PersonId,
  ): Promise<{ hibernating: boolean; timeZone: TimeZone }> {
    const { settings, hibernating } = await cottageOf(env, person).settings();
    return { hibernating, timeZone: settings.timeZone };
  },
  muteFarm: (env: Bindings, person: PersonId, farm: string, until: number | null) =>
    cottageOf(env, person).muteFarm(farm, until),
};
