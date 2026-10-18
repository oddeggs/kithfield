import { useEffect, useMemo } from 'react';
import { z } from 'zod';

import { useDataClient } from '../../../data';
import { blocksPort, connectBlocks, type Blocks } from '../../../data/blocks';
import { safetyApi, type SafetyApi } from '../../safety/safety-api';
import type { Method, Request } from './request';
import { settingsApi, type SettingsApi } from './settings-api';

/**
 * The one authenticated request every settings and safety call goes through: the data layer's
 * own, on its network and session, with its 401 handling. A call that doesn't need the answer
 * (`schema` null) accepts any body.
 */
function useRequest(): Request {
  const { api } = useDataClient();
  return useMemo(
    () =>
      (async (schema: z.ZodType | null, method: Method, path: string, body?: unknown) => {
        const answer: unknown = await api.request(schema ?? z.unknown(), method, path, body);
        return schema === null ? undefined : answer;
      }) as Request,
    [api],
  );
}

export function useSettingsApi(): SettingsApi {
  const request = useRequest();
  return useMemo(() => settingsApi(request), [request]);
}

export function useSafetyApi(): SafetyApi {
  const request = useRequest();
  return useMemo(() => safetyApi(request), [request]);
}

/**
 * The phone's one block list (connected at startup through the data layer's requests), read
 * fresh when a screen that shows or changes it opens.
 */
export function useBlocks(): Blocks {
  const client = useDataClient();
  const blocks = useMemo(() => connectBlocks(blocksPort(client.api)), [client]);
  useEffect(() => {
    blocks.refresh().catch(() => undefined);
  }, [blocks]);
  return blocks;
}
