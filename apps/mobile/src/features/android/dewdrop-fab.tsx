import type { FarmId } from '@kithfield/contracts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSend } from '../../data';
import { ArtIcon } from '../../ui/art/art-view';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { NAV_BAR, navBarHeight } from '../../ui/tab-bar/material-bar';
import { useTheme } from '../../ui/theme/theme-provider';
import { androidColours } from './android-colours';

/**
 * Android's floating action for the dewdrop (`14 Platforms`): over the farm home's sheet,
 * just above the navigation bar. A tap leaves a dewdrop on the farm, as the chat's dewdrop does.
 */
export function DewdropFab({ farm }: { readonly farm: FarmId }) {
  const send = useSend(farm);
  const toast = useToast();
  const { t } = useLocale();
  const { appearance } = useTheme();
  const insets = useSafeAreaInsets();
  const colours = androidColours[appearance];
  return (
    <Press
      haptic="soft"
      radius={NAV_BAR.fabRadius}
      onPress={() => {
        void send('dewdrop', {});
        toast.show(t('chat.composer.dewdropLeft'), 'dewdrop');
      }}
      accessibilityRole="button"
      accessibilityLabel={t('chat.composer.dewdrop')}
      style={{
        position: 'absolute',
        right: NAV_BAR.fabGap,
        bottom: navBarHeight(insets.bottom) + NAV_BAR.fabGap,
        width: NAV_BAR.fab,
        height: NAV_BAR.fab,
        borderRadius: NAV_BAR.fabRadius,
        backgroundColor: colours.fab,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 6px 14px -4px ${colours.fabShadow}`,
      }}
    >
      <ArtIcon name="dewdrop" size={30} color={colours.fabIcon} />
    </Press>
  );
}
