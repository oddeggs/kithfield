import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { ChatScreen } from '../../../features/chat/room/chat-screen';
import { setOpenChat } from '../../../ui/layout/open-chat';

const seqOf = (value: string | string[] | undefined): number | undefined => {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/**
 * A farm's chat or a visit. `seq` scrolls to a message; `replyTo` (the message menu's Reply) and
 * `edit` start a reply or an edit.
 */
export default function ChatRoute() {
  const params = useLocalSearchParams<{
    farm: string;
    seq?: string;
    replyTo?: string;
    edit?: string;
  }>();
  const seq = seqOf(params.seq);
  const reply = seqOf(params.replyTo);
  const edit = seqOf(params.edit);
  // The chat in front is the one a large screen's sidebar marks, and keeps open as it resizes.
  useFocusEffect(useCallback(() => setOpenChat(params.farm), [params.farm]));
  return (
    <ChatScreen
      key={params.farm}
      farm={params.farm}
      {...(seq === undefined ? {} : { seq })}
      {...(reply === undefined ? {} : { reply })}
      {...(edit === undefined ? {} : { edit })}
    />
  );
}
