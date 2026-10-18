import type {
  CottageDelivery,
  CottageFarm,
  FarmNotifications,
  PersonId,
  TimeZone,
} from '@kithfield/contracts';

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
  /**
   * Whether the person hibernates, and their own time zone once their app has sent it (slow posts
   * arrive in it); null before then.
   */
  async settingsOf(
    env: Bindings,
    person: PersonId,
  ): Promise<{ hibernating: boolean; timeZone: TimeZone | null }> {
    const { settings, hibernating, zoneKnown } = await cottageOf(env, person).settings();
    return { hibernating, timeZone: zoneKnown ? settings.timeZone : null };
  },
  /** Mute and the per-kind push toggles for one farm. */
  setFarmNotifications: (
    env: Bindings,
    person: PersonId,
    farm: string,
    settings: FarmNotifications,
  ) => cottageOf(env, person).setFarmNotifications(farm, settings),
};
