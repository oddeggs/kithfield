import { useLocalSearchParams } from 'expo-router';

import { ChatScreen } from '../../../features/chat/room/chat-screen';
import { DeskChat } from '../../../web/desk/desk-chat';
import { useDesk } from '../../../web/desk/desk-shell';

const seqOf = (value: string | string[] | undefined): number | undefined => {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/**
 * A farm's chat or a visit in the browser: the phone's chat when narrow, the desktop's middle
 * pane (beside the farm) when wide.
 */
export default function ChatRoute() {
  const { wide } = useDesk();
  const params = useLocalSearchParams<{
    farm: string;
    seq?: string;
    replyTo?: string;
    edit?: string;
  }>();
  const seq = seqOf(params.seq);
  if (wide) {
    return (
      <DeskChat key={params.farm} farm={params.farm} {...(seq === undefined ? {} : { seq })} />
    );
  }
  const reply = seqOf(params.replyTo);
  const edit = seqOf(params.edit);
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
