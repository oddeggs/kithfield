import type { CottageDelivery } from '@kithfield/contracts';

import { eitherBlocked } from '../auth';
import * as chats from './chats';
import { farmFromDirectory } from './directory';
import { considerDelivery, type Intake } from './intake';
import { isPurged } from './schema';
import { updateProfile } from './profile';

/**
 * Takes a farm's delivery into the chat list and Quick Tend. A farm the cottage wasn't told about
 * is looked up first, so a missed `upsertFarm` never hides a chat. The person opening a farm
 * themselves brings nudges back to the first. False for a repeat, or once the person is purged.
 */
export async function receiveDelivery(intake: Intake, delivery: CottageDelivery): Promise<boolean> {
  const { sql, person, now } = intake;
  if (isPurged(sql)) return false;
  if (!chats.knowsFarm(sql, delivery.farm)) {
    const info = await farmFromDirectory(intake.env.DB, delivery.farm, person);
    if (info !== null) chats.upsertFarm(sql, info);
  }
  // The chat row still follows the farm; nothing waits from someone either of them blocked.
  const taken = (await fromBlocked(intake, delivery)) ? { ...delivery, forYou: false } : delivery;
  if (!chats.applyDelivery(sql, taken, person, now)) return false;
  if (delivery.actor === person && delivery.kind === 'farm_opened') {
    updateProfile(sql, (profile) => ({ ...profile, nudgesSinceBack: 0 }));
  }
  return true;
}

const blockedChecks = new WeakMap<Intake, Promise<boolean>>();

/**
 * Whether the person and the delivery's actor blocked each other, either way: then it neither
 * waits in Quick Tend nor pushes. Asked of D1 once per delivery, and only about someone else's event.
 */
function fromBlocked(intake: Intake, delivery: CottageDelivery): Promise<boolean> {
  const { actor } = delivery;
  if (actor === null || actor === intake.person) return Promise.resolve(false);
  let check = blockedChecks.get(intake);
  if (check === undefined) {
    check = eitherBlocked(intake.env.DB, intake.person, actor);
    blockedChecks.set(intake, check);
  }
  return check;
}

/** Decides on the delivery's push. If that fails, the farm's retry is taken, not seen as a repeat. */
export async function decideDelivery(intake: Intake, delivery: CottageDelivery): Promise<void> {
  try {
    if (await fromBlocked(intake, delivery)) return;
    await considerDelivery(intake, delivery);
  } catch (error) {
    chats.forgetDelivered(intake.sql, delivery.farm, delivery.seq);
    throw error;
  }
}
