import { type FarmEvent, type FarmState, isTombstone } from '@kithfield/contracts';

import { endMembership, setRole, updateFarm, upsertMembership } from './d1';

/**
 * D1's mirror of who lives on a farm, kept in step with the log: joining, leaving, removal, roles,
 * and the farm's name and land. The farm's own state is the truth; this copy serves the farm list,
 * push fan-out and the gate's friends-of-friends check. Throws if D1 fails, for a retry.
 */
export const mirrorMembership = async (
  db: D1Database,
  state: FarmState,
  event: FarmEvent,
): Promise<void> => {
  if (isTombstone(event.payload)) return;
  const farm = state.farm;
  if (event.kind === 'joined' && event.actor !== null) {
    const role = state.members.find((m) => m.person === event.actor)?.role ?? 'critter';
    await upsertMembership(db, farm, event.actor, role, event.at);
  } else if (event.kind === 'left' && event.actor !== null) {
    await endMembership(db, farm, event.actor, event.at);
  } else if (event.kind === 'removed') {
    await endMembership(db, farm, event.payload.person, event.at);
  } else if (event.kind === 'settings_changed') {
    const p = event.payload;
    if (p.setting === 'name') await updateFarm(db, farm, { name: p.name });
    if (p.setting === 'land') await updateFarm(db, farm, { land: p.land });
    if (p.setting === 'role') {
      await setRole(db, farm, p.person, p.role);
      if (p.role === 'keeper') await updateFarm(db, farm, { keeper: p.person });
    }
  }
};
