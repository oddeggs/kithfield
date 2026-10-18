import { registerAccountDeletionStep, registerSocketCloser } from '../auth';
import type { Bindings } from '../env';
import { farmsTouchedBy } from './d1';
import { farmStub } from './http';

/*
 * The farms' part of deleting an account. When someone asks, their farm sockets close with their
 * sessions. When their 30 days are over, every farm they live on, lived on or visited writes
 * `left {how: account_deleted}` and tombstones what they wrote there (`FarmDO.deleteAccount`).
 */

/** Closes the person's sockets on every farm they live on. */
export const closeFarmSockets = async (env: Bindings, person: string): Promise<void> => {
  const { results } = await env.DB.prepare(
    'SELECT farm_id FROM memberships WHERE person_id = ? AND left_at IS NULL',
  )
    .bind(person)
    .all<{ farm_id: string }>();
  await Promise.all(
    results.map(({ farm_id }) => farmStub(env, farm_id).closeSockets(person, 'unauthorized')),
  );
};

/** Every farm the person touched forgets them. One farm failing fails the step, for a retry. */
export const deleteFromFarms = async (env: Bindings, person: string): Promise<void> => {
  for (const farm of await farmsTouchedBy(env.DB, person)) {
    await farmStub(env, farm).deleteAccount(person);
  }
};

registerSocketCloser(closeFarmSockets);
registerAccountDeletionStep('farms', deleteFromFarms);
