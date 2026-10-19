import type { FarmId } from '@kithfield/contracts';
import { screens } from '@kithfield/theme';
import { router } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../ui/art/art-view';
import { Glass } from '../../ui/components/glass';
import { FloatingPanel } from '../../ui/layout/floating-panel';
import { useScreenLayout } from '../../ui/layout/pane';
import { hasSidebar } from '../../ui/layout/size-class';
import { setOpenChat } from '../../ui/layout/open-chat';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
// The farm's chat, floating at its side.
import { ChatScreen } from '../chat/room/chat-screen';
// Leaving a firefly, straight from the farm.
import { gestureRoutes } from '../gestures';
import { JustYou } from './just-you';
import { farmRoutes } from './routes';

const chips = screens.farmChips;
const panelSide = screens.floatingChat.side;

function Chip({
  icon,
  label,
  onPress,
}: {
  readonly icon: string;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Press onPress={onPress} haptic="select" radius={chips.height / 2} accessibilityRole="button">
      <Glass
        radius={chips.height / 2}
        fill={palette.tabBar.fill}
        border={palette.glassButton.border}
        style={{
          height: chips.height,
          paddingLeft: 10,
          paddingRight: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <ArtIcon name={icon} size={chips.icon} color={palette.text} />
        <Txt variant="buttonSmall" style={{ fontSize: 14 }}>
          {label}
        </Txt>
      </Glass>
    </Press>
  );
}

/**
 * What sits over the large-screen farm (`14 Platforms`): the farm's chat floating at the trailing
 * side, and the ways out along the bottom: the seed bed, a firefly, the fire. The chat's title
 * opens it beside farms and visits.
 */
export function LargeFarmChrome({
  farm,
  onFire,
}: {
  readonly farm: FarmId;
  readonly onFire: () => void;
}) {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sidebar = hasSidebar(useScreenLayout());
  // The ways out keep left of the chat, wrapping upwards where the window is narrow.
  const room = width - insets.left - chips.side * 2 - screens.floatingChat.width - panelSide;
  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: chips.side + insets.left,
          bottom: chips.bottom,
          maxWidth: room,
          flexDirection: 'row',
          flexWrap: 'wrap-reverse',
          gap: chips.gap,
        }}
      >
        <Chip
          icon="seeds"
          label={t('layout.farm.seedBed')}
          onPress={() => router.navigate(farmRoutes.seedbed())}
        />
        <Chip
          icon="firefly"
          label={t('layout.farm.firefly')}
          onPress={() => router.push(gestureRoutes.firefly(farm))}
        />
        <Chip icon="lantern" label={t('layout.farm.fire')} onPress={onFire} />
      </View>
      <FloatingPanel
        expand={{
          label: sidebar ? t('layout.chat.openBeside') : t('layout.chat.open'),
          onPress: () => {
            setOpenChat(farm);
            // Beside farms and visits on an iPad; over the chat list beside an opened foldable's farm.
            if (sidebar) router.navigate('/(tabs)/chat');
            else router.push({ pathname: '/(tabs)/chat/[farm]', params: { farm } });
          },
        }}
      >
        <ChatScreen farm={farm} />
      </FloatingPanel>
    </>
  );
}

/**
 * A farm with only you on it, full screen: the card that asks friends over sits above the ways
 * out, where the phone's sheet would hold it.
 */
export function LargeFarmInvite({ onInvite }: { readonly onInvite: () => void }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        left: chips.side + insets.left,
        bottom: chips.bottom + chips.height + chips.gap * 2,
        width: screens.floatingChat.width,
        padding: 20,
        borderRadius: screens.floatingChat.radius,
        backgroundColor: palette.sheet,
        boxShadow: screens.floatingChat.shadow,
      }}
    >
      <JustYou onInvite={onInvite} />
    </View>
  );
}
