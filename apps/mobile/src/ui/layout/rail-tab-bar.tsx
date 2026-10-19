import { screens } from '@kithfield/theme';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../art/art-view';
import { Avatar } from '../art/avatar';
import { HoneyDot } from '../components/honey-dot';
import { useLocale } from '../locale/locale-provider';
import { haptics } from '../motion/haptics';
import { fadeTo } from '../motion/motion';
import { Press } from '../motion/press';
import { useTheme } from '../theme/theme-provider';
import { useTabDots, useYou } from '../tab-bar/tab-activity';
import { tabBarHidden, tabs, type TabName } from '../tab-bar/tabs';

const rail = screens.rail;
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

/** Whether the window keeps a rail of system controls down its trailing side (a foldable). */
export function useControlsRail(): boolean {
  return useSafeAreaInsets().right >= rail.minInset;
}

/**
 * The tab bar standing upright in the rail of controls down a foldable's trailing side
 * (`14 Platforms`, the vertical-controls pattern): the four tabs in a column at the rail's foot,
 * the active one on a soft circle, new activity as a honey dot. It steps aside, as the floating
 * bar does, while a tab has a screen pushed over its first.
 */
export function RailTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { t } = useLocale();
  const dots = useTabDots();
  const you = useYou();
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
      pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      style={[
        {
          position: 'absolute',
          right: (insets.right - rail.width) / 2,
          bottom: Math.max(insets.bottom, rail.bottom),
          width: rail.width,
          borderRadius: rail.width / 2,
          paddingVertical: 6,
          gap: 4,
          alignItems: 'center',
          backgroundColor: palette.tabBar.fill,
          boxShadow: palette.tabBar.shadow,
        },
        fade,
      ]}
    >
      <View accessibilityRole="tabbar" style={{ gap: 4 }}>
        {tabs.map((tab) => {
          const on = tab === active;
          const label = t(labelKeys[tab]);
          return (
            <Press
              key={tab}
              darken={false}
              radius={rail.item / 2}
              onPress={() => {
                const key = keyOf(tab);
                if (key === undefined) return;
                const event = emitter.emit({
                  type: 'tabPress',
                  target: key,
                  canPreventDefault: true,
                });
                if (tab !== active && !event.defaultPrevented) {
                  haptics.select();
                  navigateToTab(key);
                }
              }}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: on }}
              {...(dots[tab] ? { accessibilityValue: { text: t('shell.tab.somethingNew') } } : {})}
              style={{
                width: rail.item,
                height: rail.item,
                borderRadius: rail.item / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? palette.tabBar.activeBg : 'transparent',
              }}
            >
              {tab === 'you' && you ? (
                <Avatar kind={you.kind} {...(you.look ? { look: you.look } : {})} size={26} />
              ) : tab === 'you' ? (
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: palette.fillSoft,
                  }}
                />
              ) : (
                <ArtIcon
                  name={icons[tab]}
                  size={24}
                  color={on ? palette.tabActive : palette.tabInactive}
                />
              )}
              {dots[tab] ? <HoneyDot style={{ position: 'absolute', top: 8, right: 8 }} /> : null}
            </Press>
          );
        })}
      </View>
    </Animated.View>
  );
}
