import { Tabs } from 'expo-router/tabs';
import { Platform, useWindowDimensions } from 'react-native';

import { NavigationBar } from '../../features/android/navigation-bar';
import { useScreenLayout } from '../../ui/layout/pane';
import { hasSidebar, paneWidths } from '../../ui/layout/size-class';
import { RailTabBar, useControlsRail } from '../../ui/layout/rail-tab-bar';
import { TabBarRegion } from '../../ui/layout/tab-bar-region';
import { TabBar } from '../../ui/tab-bar/tab-bar';

/**
 * The four tabs, each with its own native stack. The bar floats over the screens, so each tab's
 * screen runs to the bottom edge and leaves room with `tabBarClearance`.
 *
 * On a large screen the Chats tab shows farms and visits beside the chat, and the Farm tab the
 * farm full screen with the chat at its side: each finds the rest of the app from there, so the
 * bar steps aside on those two and keeps a phone's width on the others.
 */
export default function TabsLayout() {
  const kind = useScreenLayout();
  const { width } = useWindowDimensions();
  // A foldable's rail of controls down the trailing side carries the tabs, upright.
  const rail = useControlsRail();
  return (
    <Tabs
      tabBar={(props) => {
        if (rail) return <RailTabBar {...props} />;
        if (kind === 'phone') {
          // Android's Material navigation bar (`14 Platforms`).
          if (Platform.OS === 'android') return <NavigationBar {...props} />;
          return <TabBar {...props} />;
        }
        const tab = props.state.routes[props.state.index]?.name;
        if (tab === 'farm' || (tab === 'chat' && hasSidebar(kind))) return null;
        // Beside an opened foldable's farm, the bar serves the chat's half.
        const left = tab === 'chat' && kind === 'pair' ? width - paneWidths(kind, width).main : 0;
        return (
          <TabBarRegion left={left}>
            <TabBar {...props} />
          </TabBarRegion>
        );
      }}
      screenOptions={{ headerShown: false, animation: 'none' }}
    >
      <Tabs.Screen name="farm" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="seedbed" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}
