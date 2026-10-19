import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { HoneyDot } from '../../ui/components/honey-dot';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { fadeTo, sheetTo } from '../../ui/motion/motion';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTabDots, useYou } from '../../ui/tab-bar/tab-activity';
import { tabBarHidden, tabs, type TabName } from '../../ui/tab-bar/tabs';
import { useTheme } from '../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../ui/type/accessibility-size';
import { Txt } from '../../ui/type/text';
import { androidColours } from './android-colours';
import { NAV_BAR, navBarBottom } from '../../ui/tab-bar/material-bar';

const icons: Record<Exclude<TabName, 'you'>, string> = {
  farm: 'farm',
  chat: 'chat',
  seedbed: 'seeds',
};
const labelKeys = {
  farm: 'shell.tab.farm',
  chat: 'shell.tab.chat',
  seedbed: 'shell.tab.seedBed',
  you: 'shell.tab.you',
} as const;

const isTab = (name: string): name is TabName => (tabs as readonly string[]).includes(name);

/** One destination: the icon on its pill, which grows out from the middle when it's chosen. */
function Destination({
  tab,
  focused,
  dot,
  onPress,
  onLongPress,
}: {
  readonly tab: TabName;
  readonly focused: boolean;
  readonly dot: boolean;
  readonly onPress: () => void;
  readonly onLongPress: () => void;
}) {
  const { appearance } = useTheme();
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const you = useYou();
  const showLabel = !useAccessibilitySize();
  const colours = androidColours[appearance];
  const colour = focused ? colours.navActive : colours.navInactive;
  const label = t(labelKeys[tab]);
  const grown = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    grown.set(reduce ? fadeTo(focused ? 1 : 0) : sheetTo(focused ? 1 : 0, false));
  }, [focused, reduce, grown]);
  const pill = useAnimatedStyle(() => ({
    opacity: Math.min(1, grown.get() * 1.5),
    transform: [{ scaleX: reduce ? 1 : 0.5 + grown.get() * 0.5 }],
  }));
  return (
    <Press
      darken={false}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      {...(dot ? { accessibilityValue: { text: t('shell.tab.somethingNew') } } : {})}
      style={{ flex: 1, alignItems: 'center', gap: NAV_BAR.labelGap }}
    >
      <View
        style={{
          width: NAV_BAR.pillWidth,
          height: NAV_BAR.pillHeight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              inset: 0,
              borderRadius: NAV_BAR.pillHeight / 2,
              backgroundColor: colours.navPill,
            },
            pill,
          ]}
        />
        {tab === 'you' ? (
          you ? (
            <Avatar kind={you.kind} {...(you.look ? { look: you.look } : {})} size={NAV_BAR.icon} />
          ) : (
            <View
              style={{
                width: NAV_BAR.icon,
                height: NAV_BAR.icon,
                borderRadius: NAV_BAR.icon / 2,
                backgroundColor: colours.navPill,
              }}
            />
          )
        ) : (
          <ArtIcon name={icons[tab]} size={NAV_BAR.icon} color={colour} />
        )}
        {dot ? <HoneyDot style={{ position: 'absolute', top: 2, right: 14 }} /> : null}
      </View>
      {showLabel ? (
        <Txt
          numberOfLines={1}
          allowFontScaling={false}
          color={colour}
          medium
          style={{ fontSize: NAV_BAR.labelSize, lineHeight: NAV_BAR.labelLine }}
        >
          {label}
        </Txt>
      ) : null}
    </Press>
  );
}

/**
 * Android's Material 3 navigation bar (`14 Platforms`, 14-05): full width along the bottom edge,
 * under the system's gesture handle, the chosen tab on a moss pill. It takes the iOS floating
 * bar's place and steps aside the same way when a tab's stack goes deeper.
 */
export function NavigationBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { appearance } = useTheme();
  const insets = useSafeAreaInsets();
  const dots = useTabDots();
  const hidden = tabBarHidden(state);
  const shown = useSharedValue(hidden ? 0 : 1);
  useEffect(() => {
    shown.set(fadeTo(hidden ? 0 : 1));
  }, [hidden, shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const focused = state.routes[state.index];
  const active = focused && isTab(focused.name) ? focused.name : 'farm';
  const keyOf = (tab: TabName) => state.routes.find((r) => r.name === tab)?.key;
  return (
    <Animated.View
      accessibilityRole="tabbar"
      pointerEvents={hidden ? 'none' : 'auto'}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: 'row',
          paddingTop: NAV_BAR.paddingTop,
          paddingBottom: navBarBottom(insets.bottom),
          backgroundColor: androidColours[appearance].navBar,
        },
        fade,
      ]}
    >
      {tabs.map((tab) => (
        <Destination
          key={tab}
          tab={tab}
          focused={tab === active}
          dot={dots[tab]}
          onPress={() => {
            const key = keyOf(tab);
            if (key === undefined) return;
            const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
            if (tab !== active && !event.defaultPrevented) {
              haptics.select();
              navigateToTab(key);
            }
          }}
          onLongPress={() => {
            const key = keyOf(tab);
            if (key !== undefined) emitter.emit({ type: 'tabLongPress', target: key });
          }}
        />
      ))}
    </Animated.View>
  );
}
