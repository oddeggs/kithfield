import { transitions, type TransitionName } from '@kithfield/theme';

import { SHEET_SETTLE_MS } from './geometry';

/**
 * A storyboard's timing, in milliseconds (`transitions` in `@kithfield/theme`, from
 * `18 Motion and Transitions`): `timing('critterTravel', 'out')` is 480. A part the storyboard
 * doesn't name falls back to the sheet spring's own time.
 */
export function timing(name: TransitionName, part: string): number {
  return transitions[name].ms[part] ?? SHEET_SETTLE_MS;
}
