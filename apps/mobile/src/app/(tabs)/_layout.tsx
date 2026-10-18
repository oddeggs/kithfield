import { Tabs } from 'expo-router/tabs';

import { TabBar } from '../../ui/tab-bar/tab-bar';

/**
 * The four tabs, each with its own native stack. The bar floats over the screens, so each tab's
 * screen runs to the bottom edge and leaves room with `tabBarClearance`.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'none' }}
    >
      <Tabs.Screen name="farm" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="seedbed" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}
