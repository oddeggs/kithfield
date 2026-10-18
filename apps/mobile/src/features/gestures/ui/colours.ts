import { gestureColours, type GestureColours } from '@kithfield/theme';

import { useTheme } from '../../../ui/theme/theme-provider';

/** The gesture screens' own colours, in the appearance the app is in. */
export function useGestureColours(): GestureColours {
  return gestureColours[useTheme().palette.appearance];
}
