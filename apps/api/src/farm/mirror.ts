import { type FarmEvent, type FarmState, isTombstone } from '@kithfield/contracts';

import { endMembership, updateFarm, upsertMembership } from './d1';

/**
 * D1's mirror of who lives on a farm, kept in step with the log: joining, leaving, removal, roles,
 * and the farm's name and land. The farm's own state is the truth and this copy is written from it
 * as it is now, never from the event's payload, so a retry that runs late can't bring back a
 * membership that has since ended. It serves the farm list, push fan-out and the gate's
 * friends-of-friends check. Throws if D1 fails, for a retry.
 */
export const mirrorMembership = async (
  db: D1Database,
  state: FarmState,
  event: FarmEvent,
): Promise<void> => {
  if (isTombstone(event.payload)) return;
  const farm = state.farm;
  const person =
    event.kind === 'joined' || event.kind === 'left'
      ? event.actor
      : event.kind === 'removed'
        ? event.payload.person
        : event.kind === 'settings_changed' && event.payload.setting === 'role'
          ? event.payload.person
          : null;
  if (person !== null) {
    const member = state.members.find((m) => m.person === person);
    if (member === undefined) {
      await endMembership(db, farm, person, event.at);
    } else {
      await upsertMembership(db, farm, person, member.role, member.joinedAt);
    }
    // Who keeps the farm can change with a role or a departure (the farm hands it over).
    const keeper = state.members.find((m) => m.role === 'keeper');
    if (keeper !== undefined && event.kind !== 'joined') {
      await updateFarm(db, farm, { keeper: keeper.person });
    }
  }
  if (event.kind === 'settings_changed') {
    const { setting } = event.payload;
    if (setting === 'name' && state.name !== null) await updateFarm(db, farm, { name: state.name });
    if (setting === 'land') await updateFarm(db, farm, { land: state.land });
  }
};
