import { Stack } from 'expo-router';

import { ChatSidebar } from '../../../features/chat/list/chat-sidebar';
import { LiveFarm } from '../../../features/farm/live-farm';
import { useScreenLayout } from '../../../ui/layout/pane';
import { SplitView } from '../../../ui/layout/split-view';
import { useTheme } from '../../../ui/theme/theme-provider';

/** A link straight to a pushed screen still has the tab's first screen under it to go back to. */
export const unstable_settings = { initialRouteName: 'index' };

/**
 * The Chats tab's stack. On a large screen it sits between farms and visits and the live farm
 * (an iPad), or beside the farm (an opened foldable); its screens carry on as the window resizes.
 */
export default function TabStack() {
  const { palette } = useTheme();
  const kind = useScreenLayout();
  return (
    <SplitView
      kind={kind}
      leading={kind === 'pair' ? <LiveFarm named /> : <ChatSidebar />}
      trailing={<LiveFarm />}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
        }}
      />
    </SplitView>
  );
}
