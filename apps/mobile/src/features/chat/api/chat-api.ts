import {
  ErrorBody,
  EventsPage,
  FarmNotificationsView,
  ReadUrlsResponse,
  SearchResults,
  UploadUrlResponse,
  type FarmId,
  type FarmNotifications,
  type MediaKey,
  type UploadUrlRequest,
} from '@kithfield/contracts';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { type z } from 'zod';

import { BEARER_KEY } from '../../../data/session';
import { muteSettings } from '../model/mute';

/*
 * The chat's own HTTP calls, coded against the contracts: search, pinning and muting a chat, and
 * signed reads and uploads of media. They use the session the data layer keeps in the Keychain.
 * (The data layer's API client doesn't carry these yet; see the lane report.)
 */

export class ChatApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`The API answered ${status} ${code}`);
    this.name = 'ChatApiError';
  }
}

const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const apiBase = (): string => (Constants.expoConfig?.extra as { apiBase: string }).apiBase;

async function send(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const bearer = await SecureStore.getItemAsync(BEARER_KEY, KEYCHAIN);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15_000);
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method,
      credentials: 'omit',
      signal: abort.signal,
      headers: {
        accept: 'application/json',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text === '' ? null : (JSON.parse(text) as unknown);
    } catch {
      data = undefined;
    }
    if (!response.ok) {
      const error = ErrorBody.safeParse(data);
      throw new ChatApiError(response.status, error.success ? error.data.error.code : 'unknown');
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** A request whose answer must be what the contract says. */
async function request<S extends z.ZodType>(
  schema: S,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await send(method, path, body));
  if (!parsed.success) throw new ChatApiError(200, 'unknown');
  return parsed.data;
}

/** A request answered with no body (204). */
async function command(method: 'PUT' | 'PATCH', path: string, body: unknown): Promise<void> {
  await send(method, path, body);
}

const farmPath = (farm: FarmId) => `/v1/farms/${encodeURIComponent(farm)}`;

export const chatApi = {
  /** The farm's own full-text search. */
  search: (farm: FarmId, q: string) =>
    request(SearchResults, 'GET', `${farmPath(farm)}/search?q=${encodeURIComponent(q)}`),

  /** Pins a farm or visit to the top of the chat list, or unpins it. */
  setPinned: (farm: FarmId, pinned: boolean) =>
    command('PATCH', `/v1/chats/${encodeURIComponent(farm)}`, { pinned }),

  /** What knocks for this person on a farm, and whether it is muted. */
  notifications: (farm: FarmId) =>
    request(FarmNotificationsView, 'GET', `${farmPath(farm)}/notifications`),

  setNotifications: (farm: FarmId, settings: FarmNotifications) =>
    command('PUT', `${farmPath(farm)}/notifications`, settings),

  /** A page of the farm's shared media (photos, video, links, voice), oldest first. */
  sharedPage: async (farm: FarmId, before: number | null) => {
    const query = new URLSearchParams({ limit: '200', kinds: 'media,link,voice,unsend' });
    if (before !== null) query.set('before', String(before));
    return request(EventsPage, 'GET', `${farmPath(farm)}/events?${query.toString()}`);
  },

  /** Short-lived signed reads of media, checked against membership. */
  readUrls: (keys: readonly MediaKey[]) =>
    request(ReadUrlsResponse, 'POST', '/v1/media/read-urls', { keys }),

  /** A presigned upload for a file of the farm's. */
  uploadUrl: (upload: UploadUrlRequest) =>
    request(UploadUrlResponse, 'POST', '/v1/media/upload-url', upload),
};

/** Mutes a farm until turned back on, or unmutes it, keeping what knocks as it was. */
export async function setMuted(farm: FarmId, muted: boolean): Promise<void> {
  await chatApi.setNotifications(
    farm,
    await muteSettings(() => chatApi.notifications(farm), muted),
  );
}

/** Uploads a local file into the farm's media; answers its key. */
export async function uploadFile(
  farm: FarmId,
  kind: UploadUrlRequest['kind'],
  uri: string,
  mime: string,
): Promise<{ key: MediaKey; bytes: number }> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new ChatApiError(0, 'file_missing');
  const bytes = info.size;
  const upload = await chatApi.uploadUrl({ farm, kind, bytes, mime });
  if (upload.upload !== 'single') throw new ChatApiError(413, 'payload_too_large');
  const put = await FileSystem.uploadAsync(upload.url, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'content-type': mime },
  });
  if (put.status < 200 || put.status >= 300) throw new ChatApiError(put.status, 'upload_failed');
  return { key: upload.key, bytes };
}
