import type { CottageDelivery } from '@kithfield/contracts';

import * as chats from './chats';
import { farmFromDirectory } from './directory';
import { considerDelivery, type Intake } from './intake';
import { updateProfile } from './profile';

/**
 * Takes a farm's delivery into the chat list and Quick Tend. A farm the cottage wasn't told about
 * is looked up first, so a missed `upsertFarm` never hides a chat. The person opening a farm
 * themselves brings nudges back to the first. False for a repeat.
 */
export async function receiveDelivery(intake: Intake, delivery: CottageDelivery): Promise<boolean> {
  const { sql, person, now } = intake;
  if (!chats.knowsFarm(sql, delivery.farm)) {
    const info = await farmFromDirectory(intake.env.DB, delivery.farm, person);
    if (info !== null) chats.upsertFarm(sql, info);
  }
  if (!chats.applyDelivery(sql, delivery, person, now)) return false;
  if (delivery.actor === person && delivery.kind === 'farm_opened') {
    updateProfile(sql, (profile) => ({ ...profile, nudgesSinceBack: 0 }));
  }
  return true;
}

/** Decides on the delivery's push. If that fails, the farm's retry is taken, not seen as a repeat. */
export async function decideDelivery(intake: Intake, delivery: CottageDelivery): Promise<void> {
  try {
    await considerDelivery(intake, delivery);
  } catch (error) {
    chats.forgetDelivered(intake.sql, delivery.farm, delivery.seq);
    throw error;
  }
}
