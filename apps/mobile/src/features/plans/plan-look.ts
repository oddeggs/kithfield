import { planColours, type PlanColours } from '@kithfield/theme';

import { useTheme } from '../../ui/theme/theme-provider';

export { fireside, organiserHat, sunPatch } from '@kithfield/theme';

/** The plan colours for the current appearance. */
export function usePlanLook(): PlanColours {
  return planColours[useTheme().appearance];
}
