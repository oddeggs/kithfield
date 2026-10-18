import type { PersonId, Role } from '@kithfield/contracts';

export type MemberAction =
  'leave' | 'makeHelper' | 'makeKeeper' | 'makeCritter' | 'report' | 'remove' | 'block';

/**
 * The member menu's actions, in order. Keepers change roles and remove critters and helpers, but
 * never another keeper; everyone else reports and blocks. On your own row you can only leave.
 */
export function memberActions(
  me: PersonId | null,
  member: { readonly person: PersonId; readonly role: Role },
  myRole: Role | null,
): MemberAction[] {
  if (member.person === me) return ['leave'];
  if (myRole !== 'keeper') return ['report', 'block'];
  const roles: MemberAction[] = [];
  if (member.role !== 'helper') roles.push('makeHelper');
  if (member.role !== 'keeper') roles.push('makeKeeper');
  if (member.role !== 'critter') roles.push('makeCritter');
  return [...roles, 'report', member.role === 'keeper' ? 'block' : 'remove'];
}
