import { dropFarm } from '../ai/store';
import { registerAccountDeletionStep, registerSocketCloser } from '../auth';
import type { Bindings } from '../env';
import { deleteFarmMedia } from '../media/deletion';
import { farmsTouchedBy } from './d1';
import { farmStub } from './http';

/*
 * The farms' part of deleting an account. When someone asks, their farm sockets close with their
 * sessions. When their 30 days are over, every farm they live on, lived on or visited writes
 * `left {how: account_deleted}` and tombstones what they wrote there (`FarmDO.deleteAccount`).
 * A farm nobody lives on after that goes altogether: its media, its AI words, its object and its
 * D1 rows (memberships, invites and visitors with it), as `docs/backend.md` says a gone farm does.
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

/**
 * Every farm the person touched forgets them, and one left empty goes. One farm failing fails the
 * step, for a retry: the D1 row goes last, so a retry finds the farm again.
 */
export const deleteFromFarms = async (env: Bindings, person: string): Promise<void> => {
  for (const farm of await farmsTouchedBy(env.DB, person)) {
    const stub = farmStub(env, farm);
    await stub.deleteAccount(person);
    const state = await stub.state();
    if (state !== null && state.members.length > 0) continue;
    await deleteFarmMedia(env, farm);
    await dropFarm(env, farm);
    await stub.teardown();
    await env.DB.prepare('DELETE FROM farms WHERE id = ?').bind(farm).run();
  }
};

registerSocketCloser(closeFarmSockets);
registerAccountDeletionStep('farms', deleteFromFarms);
