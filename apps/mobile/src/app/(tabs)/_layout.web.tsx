import { Tabs } from 'expo-router/tabs';
import { useWindowDimensions } from 'react-native';

import { TabBar } from '../../ui/tab-bar/tab-bar';
import { DeskShell } from '../../web/desk/desk-shell';
import { platformLook } from '../../web/look';

/**
 * The tabs in the browser and on the desktop. Narrow, they are the phone's, with its bar. From
 * the desktop's width up the bar gives way to three panes (`DeskShell`): the farms and visits,
 * the screen the route shows (a chat, mostly), and the farm alive beside it.
 */
export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= platformLook.wide;
  const tabs = (
    <Tabs
      tabBar={wide ? () => null : (props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'none' }}
    >
      <Tabs.Screen name="farm" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="seedbed" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
  // One tree at every width, so crossing it keeps the screens (and their sockets) as they are.
  return <DeskShell wide={wide}>{tabs}</DeskShell>;
}
