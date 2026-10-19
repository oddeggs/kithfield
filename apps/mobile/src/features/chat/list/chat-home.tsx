import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';

import { openChat, setOpenChat } from '../../../ui/layout/open-chat';
import { useScreenLayout } from '../../../ui/layout/pane';
import { hasSidebar } from '../../../ui/layout/size-class';
import { ChatScreen } from '../room/chat-screen';
import { go } from '../routes';
import { ChatListScreen } from './chat-list-screen';
import { useShownChat } from './chat-sidebar';

/** Beside farms and visits, the Chats tab's first screen is the chat chosen there. */
function ShownChat() {
  const farm = useShownChat();
  // The farm shown for want of a choice counts as chosen, so the sidebar marks it.
  useEffect(() => {
    if (farm !== null && openChat() !== farm) setOpenChat(farm);
  }, [farm]);
  if (farm === null) return <ChatListScreen />;
  return <ChatScreen key={farm} farm={farm} />;
}

/**
 * The Chats tab's first screen: the list on a phone, or the chosen chat where the list is a
 * sidebar. A window narrowed back to the phone layout keeps the chat that was open, over the list.
 */
export function ChatHome() {
  const sidebar = hasSidebar(useScreenLayout());
  const focused = useIsFocused();
  const before = useRef(sidebar);
  useEffect(() => {
    const was = before.current;
    before.current = sidebar;
    const open = openChat();
    if (was && !sidebar && focused && open !== null) go.chat(open);
  }, [sidebar, focused]);
  return sidebar ? <ShownChat /> : <ChatListScreen />;
}
