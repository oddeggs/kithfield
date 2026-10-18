import {
  EventsPage,
  FarmNotificationsView,
  SearchResults,
  type FarmId,
} from '@kithfield/contracts';
import { z } from 'zod';

import type { ApiClient } from '../../../data';
import { muteSettings } from '../model/mute';

/*
 * The chat's own HTTP calls, coded against the contracts: search, pinning and muting a chat, and
 * a page of the farm's shared media. They go through the data layer's API client, with its
 * session and its 401 re-check.
 */

/** An answer with no body (204). */
const NoContent = z.null();

const farmPath = (farm: FarmId) => `/v1/farms/${encodeURIComponent(farm)}`;

export function chatApiOf(api: Pick<ApiClient, 'request'>) {
  const notifications = (farm: FarmId) =>
    api.request(FarmNotificationsView, 'GET', `${farmPath(farm)}/notifications`);
  return {
    /** The farm's own full-text search. */
    search: (farm: FarmId, q: string) =>
      api.request(SearchResults, 'GET', `${farmPath(farm)}/search?q=${encodeURIComponent(q)}`),

    /** Pins a farm or visit to the top of the chat list, or unpins it. */
    setPinned: async (farm: FarmId, pinned: boolean): Promise<void> => {
      await api.request(NoContent, 'PATCH', `/v1/chats/${encodeURIComponent(farm)}`, { pinned });
    },

    /** Mutes a farm until turned back on, or unmutes it, keeping what knocks as it was. */
    setMuted: async (farm: FarmId, muted: boolean): Promise<void> => {
      const settings = await muteSettings(() => notifications(farm), muted);
      await api.request(NoContent, 'PUT', `${farmPath(farm)}/notifications`, settings);
    },

    /** A page of the farm's shared media (photos, video, links, voice), oldest first. */
    sharedPage: (farm: FarmId, before: number | null) => {
      const query = new URLSearchParams({ limit: '200', kinds: 'media,link,voice,unsend' });
      if (before !== null) query.set('before', String(before));
      return api.request(EventsPage, 'GET', `${farmPath(farm)}/events?${query.toString()}`);
    },
  };
}

export type ChatApi = ReturnType<typeof chatApiOf>;
