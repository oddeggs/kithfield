import { settingsInks, type SettingsInks } from '@kithfield/theme';

import { useTheme } from '../../../ui/theme/theme-provider';

export type KitColors = SettingsInks;

/** The settings screens' inks in the appearance shown now. */
export function useKitColors(): KitColors {
  const { appearance } = useTheme();
  return settingsInks[appearance];
}
