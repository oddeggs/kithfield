import { useLocalSearchParams } from 'expo-router';

import { ChatScreen } from '../../../features/chat/room/chat-screen';

const seqOf = (value: string | string[] | undefined): number | undefined => {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** A farm's chat or a visit. `seq` scrolls to a message; `reply` and `edit` come from its menu. */
export default function ChatRoute() {
  const params = useLocalSearchParams<{
    farm: string;
    seq?: string;
    reply?: string;
    edit?: string;
  }>();
  const seq = seqOf(params.seq);
  const reply = seqOf(params.reply);
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
