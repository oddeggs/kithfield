import type { BottomTabBarProps } from 'expo-router/tabs';
import { View } from 'react-native';

import { haptics } from '../motion/haptics';
import { tabs, useTabActivity, type TabName } from './tab-activity';
import { TabBarView } from './tab-bar-view';

const isTab = (name: string): name is TabName => (tabs as readonly string[]).includes(name);

/** Space from the screen's bottom edge, as on a phone with a home indicator (04-01: 26 of 34). */
const LIFT_UNDER_INDICATOR = 8;
const BOTTOM_WITHOUT_INDICATOR = 16;
const SIDE = 16;

/** The tab bar for expo-router's tabs: floats over each tab's screen, which runs under it. */
export function TabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { dots, you } = useTabActivity();
  const focused = state.routes[state.index];
  const active = focused && isTab(focused.name) ? focused.name : 'farm';
  const keyOf = (tab: TabName) => state.routes.find((r) => r.name === tab)?.key;
  const bottom =
    insets.bottom > 0 ? insets.bottom - LIFT_UNDER_INDICATOR : BOTTOM_WITHOUT_INDICATOR;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: SIDE, right: SIDE, bottom }}
    >
      <TabBarView
        active={active}
        dots={dots}
        you={you}
        onPress={(tab) => {
          const key = keyOf(tab);
          if (key === undefined) return;
          const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
          if (tab !== active && !event.defaultPrevented) {
            haptics.select();
            navigateToTab(key);
          }
        }}
        onLongPress={(tab) => {
          const key = keyOf(tab);
          if (key !== undefined) emitter.emit({ type: 'tabLongPress', target: key });
        }}
      />
    </View>
  );
}

/** Room a tab's screen leaves at its bottom so its last row clears the floating bar. */
export function tabBarClearance(bottomInset: number): number {
  const bottom = bottomInset > 0 ? bottomInset - LIFT_UNDER_INDICATOR : BOTTOM_WITHOUT_INDICATOR;
  return bottom + 64 + 12;
}
