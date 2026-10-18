import { useMemo } from 'react';

import { useDataClient } from '../../../data';
import { chatApiOf, type ChatApi } from './chat-calls';

export { chatApiOf, type ChatApi } from './chat-calls';

/** The chat's calls on this phone's API client. */
export function useChatApi(): ChatApi {
  const data = useDataClient();
  return useMemo(() => chatApiOf(data.api), [data]);
}
