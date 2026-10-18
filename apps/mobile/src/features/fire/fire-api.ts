import {
  ConsentList,
  Entitlements,
  type FarmId,
  FireCaptionChunkResponse,
  type FireTokenResponse,
} from '@kithfield/contracts';
import Constants from 'expo-constants';
import { useMemo } from 'react';

import { ApiError, useDataClient } from '../../data';
import { useAccount } from '../../ui/session/account';
import { FireTokenAnswer, tokenAnswer, type FireMode } from './room-model';

/** The API the app was started against (`extra.apiBase`). */
const apiBase = (): string => {
  const base: unknown = (Constants.expoConfig?.extra as { apiBase?: unknown } | undefined)?.apiBase;
  return typeof base === 'string' ? base : '';
};

export interface FireApi {
  /** A LiveKit token for the farm's fire room; asking to join in lets a listener's seat publish. */
  readonly token: (
    mode: FireMode,
  ) => Promise<FireTokenResponse & { readonly captionsAvailable: boolean }>;
  /** One piece of your voice for captions; answers whether anyone still has captions on. */
  readonly sendPiece: (wav: Uint8Array, chunk: number, startedAt: number) => Promise<boolean>;
  /** Whether your patron perks (captions among them) are on. */
  readonly perks: () => Promise<boolean>;
  /** Whether you said yes to captions. */
  readonly captionsAllowed: () => Promise<boolean>;
}

export function useFireApi(farm: FarmId): FireApi {
  const { api } = useDataClient();
  const { authHeaders } = useAccount();
  return useMemo(
    () => ({
      token: async (mode) =>
        tokenAnswer(
          await api.request(
            FireTokenAnswer,
            'POST',
            `/v1/farms/${encodeURIComponent(farm)}/fire-token`,
            { mode },
          ),
        ),
      sendPiece: async (wav, chunk, startedAt) => {
        const path = `/v1/farms/${encodeURIComponent(farm)}/fire/captions?chunk=${chunk}&startedAt=${startedAt}`;
        const response = await fetch(`${apiBase()}${path}`, {
          method: 'POST',
          headers: { ...(await authHeaders()), 'content-type': 'audio/wav' },
          // The piece is a whole buffer of its own (`wavOf`), so its bytes are exactly the WAV.
          body: wav.buffer as ArrayBuffer,
          credentials: 'omit',
        });
        if (response.status === 403) return false;
        if (!response.ok) throw new ApiError(response.status, 'unknown');
        const parsed = FireCaptionChunkResponse.safeParse(await response.json());
        return parsed.success ? parsed.data.listening : false;
      },
      perks: async () => {
        try {
          return (await api.request(Entitlements, 'GET', '/v1/me/entitlements')).perks;
        } catch (error) {
          // Before the shop is open nobody has perks.
          if (error instanceof ApiError && error.status === 404) return false;
          throw error;
        }
      },
      captionsAllowed: async () => {
        const list = await api.request(ConsentList, 'GET', '/v1/me/consents');
        return list.consents.some((c) => c.feature === 'captions' && c.allowed);
      },
    }),
    [api, farm, authHeaders],
  );
}
