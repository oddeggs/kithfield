import type { RejectReason } from '@kithfield/contracts';

/** The copy for a plan write the farm turned down. */
export const refusalKey = (reason: RejectReason) =>
  reason === 'not_allowed' ? ('plans.refusedNotAllowed' as const) : ('plans.refused' as const);
